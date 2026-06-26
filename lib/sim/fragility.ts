// Fragility evaluation engine — the intellectual core.
//
// We do NOT score a strategy on whether it predicted the crash, nor on raw
// expected return. We score the SHAPE of its response to disorder, following
// Taleb–Douady's fragility-detection heuristic: perturb the scale of volatility
// up and down by Δ and look at the curvature (second difference) of the payoff
// measure. Concave response to volatility = FRAGILE; convex = ANTIFRAGILE;
// flat = ROBUST. Survival (ruin probability) is a separate, overriding gate —
// because under non-ergodic, path-dependent dynamics, ruin is absorbing.

import { MarketContext, Strategy, strategyPnl, strategyPnlVector } from "./payoff";
import { PathParams, simulatePaths } from "./paths";

export type Verdict = "ANTIFRAGILE" | "ROBUST" | "FRAGILE";

export interface Stats {
  meanPnl: number; // mean P&L (currency)
  cvar5: number; // expected shortfall, worst 5% (signed; loss negative)
  ruinProb: number; // P(loss >= ruinThreshold * capital)
  worstLoss: number; // most negative P&L observed
  bestGain: number; // most positive P&L observed
}

export interface FragilityResult {
  convexityIndex: number; // normalized 2nd difference of mean P&L vs vol (% of capital)
  verdict: Verdict;
  // survival gate
  ruinProb: number;
  worstLossPct: number; // worst loss as % of capital
  // tail shape
  tailAsymmetry: number; // mean(top 10% P&L) / |mean(bottom 10% P&L)|
  base: Stats;
  stressUp: Stats; // at vol * (1 + delta)
  stressDown: Stats; // at vol * (1 - delta)
  // chart data
  pnlSample: number[]; // sampled terminal P&L (for histogram), in % of capital
  volSweep: { volScale: number; meanPnlPct: number }[]; // mean P&L vs vol scale
}

export interface EvalConfig {
  capital: number;
  delta: number; // volatility perturbation (e.g. 0.5 = ±50% of base vol)
  ruinThreshold: number; // fraction of capital whose loss counts as "ruin"
  robustBand: number; // |convexityIndex| below this (% capital) => ROBUST
}

export const DEFAULT_EVAL: EvalConfig = {
  capital: 100000,
  delta: 0.5,
  ruinThreshold: 0.5,
  robustBand: 0.25,
};

// Compute summary stats from a P&L array.
function computeStats(pnl: Float64Array, capital: number, ruinThreshold: number): Stats {
  const n = pnl.length;
  const sorted = Float64Array.from(pnl).sort();
  let sum = 0;
  let ruinCount = 0;
  const ruinLevel = -ruinThreshold * capital;
  for (let i = 0; i < n; i++) {
    sum += pnl[i];
    if (pnl[i] <= ruinLevel) ruinCount++;
  }
  const cut = Math.max(1, Math.floor(0.05 * n));
  let tailSum = 0;
  for (let i = 0; i < cut; i++) tailSum += sorted[i];
  return {
    meanPnl: sum / n,
    cvar5: tailSum / cut,
    ruinProb: ruinCount / n,
    worstLoss: sorted[0],
    bestGain: sorted[n - 1],
  };
}

// Run the simulation at a given volatility scale and return P&L array + stats.
function evalAtVol(
  strat: Strategy,
  mkt: MarketContext,
  pathParams: Omit<PathParams, "seed" | "baseVol">,
  baseVol: number,
  volScale: number,
  cfg: EvalConfig,
  seed: number,
): { pnl: Float64Array; stats: Stats } {
  const { terminal } = simulatePaths({
    ...pathParams,
    baseVol: baseVol * volScale,
    seed,
  });
  // NOTE: pricingVol in mkt stays fixed — entry prices do not move when we
  // stress realized volatility. That separation is what makes the perturbation
  // measure true fragility rather than a repricing artifact.
  const pnl = strategyPnlVector(strat, mkt, cfg.capital, terminal);
  return { pnl, stats: computeStats(pnl, cfg.capital, cfg.ruinThreshold) };
}

export function evaluateFragility(
  strat: Strategy,
  mkt: MarketContext,
  pathParams: Omit<PathParams, "seed" | "baseVol">,
  baseVol: number,
  cfg: EvalConfig = DEFAULT_EVAL,
): FragilityResult {
  // Fixed seed across the three scenarios so the ONLY thing that differs is the
  // volatility scale — a clean finite-difference of the disorder response.
  const seed = 42;
  const base = evalAtVol(strat, mkt, pathParams, baseVol, 1.0, cfg, seed);
  const up = evalAtVol(strat, mkt, pathParams, baseVol, 1 + cfg.delta, cfg, seed);
  const down = evalAtVol(strat, mkt, pathParams, baseVol, 1 - cfg.delta, cfg, seed);

  // Taleb–Douady second difference of the payoff measure (mean P&L) wrt vol,
  // normalized to % of capital. > 0 convex (antifragile), < 0 concave (fragile).
  const secondDiff = up.stats.meanPnl + down.stats.meanPnl - 2 * base.stats.meanPnl;
  const convexityIndex = (secondDiff / cfg.capital) * 100;

  let verdict: Verdict;
  if (convexityIndex > cfg.robustBand) verdict = "ANTIFRAGILE";
  else if (convexityIndex < -cfg.robustBand) verdict = "FRAGILE";
  else verdict = "ROBUST";

  // Tail asymmetry from the base scenario.
  const sortedBase = Float64Array.from(base.pnl).sort();
  const nb = sortedBase.length;
  const decile = Math.max(1, Math.floor(0.1 * nb));
  let botSum = 0;
  let topSum = 0;
  for (let i = 0; i < decile; i++) {
    botSum += sortedBase[i];
    topSum += sortedBase[nb - 1 - i];
  }
  const meanBot = botSum / decile;
  const meanTop = topSum / decile;
  const tailAsymmetry = Math.abs(meanBot) < 1e-9 ? Infinity : meanTop / Math.abs(meanBot);

  // Down-sample base P&L (in % capital) for the histogram.
  const sampleN = Math.min(2000, nb);
  const stride = Math.max(1, Math.floor(nb / sampleN));
  const pnlSample: number[] = [];
  for (let i = 0; i < nb; i += stride) {
    pnlSample.push((base.pnl[i] / cfg.capital) * 100);
  }

  // Volatility sweep for the response curve (the visual proof of convexity).
  const volSweep: { volScale: number; meanPnlPct: number }[] = [];
  for (let vs = 0.25; vs <= 2.0001; vs += 0.25) {
    const r = evalAtVol(strat, mkt, pathParams, baseVol, vs, cfg, seed);
    volSweep.push({ volScale: vs, meanPnlPct: (r.stats.meanPnl / cfg.capital) * 100 });
  }

  return {
    convexityIndex,
    verdict,
    ruinProb: base.stats.ruinProb,
    worstLossPct: (base.stats.worstLoss / cfg.capital) * 100,
    tailAsymmetry,
    base: base.stats,
    stressUp: up.stats,
    stressDown: down.stats,
    pnlSample,
    volSweep,
  };
}

// Deterministic payoff curve: strategy P&L (% capital) across terminal prices.
// Pure function of S_T — visualizes the convexity directly, no Monte Carlo.
export function payoffCurve(
  strat: Strategy,
  mkt: MarketContext,
  capital: number,
  points = 60,
): { price: number; pnlPct: number }[] {
  const lo = mkt.s0 * 0.3;
  const hi = mkt.s0 * 1.9;
  const out: { price: number; pnlPct: number }[] = [];
  for (let i = 0; i < points; i++) {
    const price = lo + ((hi - lo) * i) / (points - 1);
    out.push({ price, pnlPct: (strategyPnl(strat, mkt, capital, price) / capital) * 100 });
  }
  return out;
}
