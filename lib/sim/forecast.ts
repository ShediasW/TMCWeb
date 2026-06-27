// Price-probability forecast engine.
//
// Where fragility.ts scores a *strategy's* response to disorder, this module
// answers the simpler question the user asked: "given fat-tailed, black-swan
// dynamics, what is the probability distribution of this stock's price?"
//
// It reuses the same power-law jump-diffusion path engine (simulatePaths) and
// turns the terminal-price cloud into actionable probabilistic insight:
// percentiles, target-hit probabilities, tail risk (VaR / expected shortfall),
// drawdown distribution, a time-resolved fan chart, and — to make Taleb's point
// visible — a side-by-side pure-Gaussian (lognormal GBM) baseline whose thin
// tails systematically understate extreme moves.

import { PathParams, simulatePaths } from "./paths";

export interface ForecastInput {
  s0: number;
  tYears: number;
  r: number; // annual drift
  baseVol: number; // annual volatility
  jumpIntensity: number;
  tailAlpha: number; // power-law tail exponent of ordinary jumps
  swanProb: number;
  swanMagnitude: number;
  swanDirection: number;
  nPaths: number;
  targetPrice?: number; // optional: probability of finishing above/below this
  seed?: number;
}

export interface Percentile {
  p: number; // percentile (e.g. 5)
  price: number; // price at that percentile
  retPct: number; // % change vs s0
}

export interface LossProb {
  dropPct: number; // threshold drop (e.g. 10, 20, 50)
  prob: number; // P(return <= -dropPct%)
}

export interface FanPoint {
  t: number; // fractional time 0..1
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface HistBin {
  mid: number; // bin midpoint, in % return
  count: number; // fat-tailed model count
  gaussCount: number; // matched-(mu,sigma) Gaussian GBM count
}

export interface ForecastOutput {
  s0: number;
  tYears: number;
  nPaths: number;
  percentiles: Percentile[]; // fat-tailed model
  gaussPercentiles: Percentile[]; // pure-Gaussian baseline (same mu, sigma)
  meanPrice: number;
  medianPrice: number;
  expectedReturnPct: number;
  // target
  targetPrice?: number;
  probAboveTarget?: number;
  probBelowTarget?: number;
  // tail risk (on terminal return)
  var5Pct: number; // 5% Value-at-Risk: the 5th-percentile return (negative)
  cvar5Pct: number; // expected shortfall: mean return of worst 5%
  lossProbs: LossProb[];
  // path-dependent drawdown (from running minimum)
  medianMaxDrawdownPct: number; // typical worst intra-horizon drawdown
  p95MaxDrawdownPct: number; // a bad-case worst drawdown
  // visuals
  histogram: HistBin[];
  fan: FanPoint[];
}

const PCTS = [1, 5, 25, 50, 75, 95, 99];
const LOSS_THRESHOLDS = [10, 20, 35, 50];

// Linear-interpolated percentile of an ascending-sorted array.
function quantileSorted(sorted: Float64Array | number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function toPercentiles(sortedPrices: Float64Array, s0: number): Percentile[] {
  return PCTS.map((p) => {
    const price = quantileSorted(sortedPrices, p);
    return { p, price, retPct: (price / s0 - 1) * 100 };
  });
}

const STEPS = 30; // time steps per path, matching the fragility engine

export function runPriceForecast(input: ForecastInput): ForecastOutput {
  const seed = input.seed ?? 42;
  const base: Omit<PathParams, "seed"> = {
    s0: input.s0,
    tYears: input.tYears,
    baseVol: input.baseVol,
    r: input.r,
    nPaths: input.nPaths,
    steps: STEPS,
    jumpIntensity: input.jumpIntensity,
    tailAlpha: input.tailAlpha,
    swanProb: input.swanProb,
    swanMagnitude: input.swanMagnitude,
    swanDirection: input.swanDirection,
  };

  // Fat-tailed model, with fan-chart recording for a capped subset of paths.
  const fat = simulatePaths({
    ...base,
    seed,
    recordBands: { count: Math.min(2000, input.nPaths), gridSteps: STEPS },
  });

  // Matched Gaussian baseline: same drift/vol, but no jumps and no black swan —
  // a plain lognormal GBM. Different seed stream so it's an independent sample.
  const gauss = simulatePaths({
    ...base,
    jumpIntensity: 0,
    swanProb: 0,
    seed: seed + 1,
  });

  const sortedFat = Float64Array.from(fat.terminal).sort();
  const sortedGauss = Float64Array.from(gauss.terminal).sort();
  const n = sortedFat.length;

  const percentiles = toPercentiles(sortedFat, input.s0);
  const gaussPercentiles = toPercentiles(sortedGauss, input.s0);

  let sum = 0;
  for (let i = 0; i < n; i++) sum += fat.terminal[i];
  const meanPrice = sum / n;
  const medianPrice = quantileSorted(sortedFat, 50);

  // Tail risk on terminal return.
  const var5Price = quantileSorted(sortedFat, 5);
  const var5Pct = (var5Price / input.s0 - 1) * 100;
  const cut = Math.max(1, Math.floor(0.05 * n));
  let tailSum = 0;
  for (let i = 0; i < cut; i++) tailSum += sortedFat[i] / input.s0 - 1;
  const cvar5Pct = (tailSum / cut) * 100;

  // Loss-threshold probabilities.
  const lossProbs: LossProb[] = LOSS_THRESHOLDS.map((dropPct) => {
    const level = input.s0 * (1 - dropPct / 100);
    let c = 0;
    for (let i = 0; i < n; i++) if (fat.terminal[i] <= level) c++;
    return { dropPct, prob: c / n };
  });

  // Target probabilities.
  let probAboveTarget: number | undefined;
  let probBelowTarget: number | undefined;
  if (input.targetPrice && input.targetPrice > 0) {
    let above = 0;
    for (let i = 0; i < n; i++) if (fat.terminal[i] >= input.targetPrice) above++;
    probAboveTarget = above / n;
    probBelowTarget = 1 - probAboveTarget;
  }

  // Drawdown distribution from running minimum (worst intra-horizon dip).
  const drawdowns = Float64Array.from(fat.minRatio, (m) => (1 - m) * 100).sort();
  const medianMaxDrawdownPct = quantileSorted(drawdowns, 50);
  const p95MaxDrawdownPct = quantileSorted(drawdowns, 95);

  return {
    s0: input.s0,
    tYears: input.tYears,
    nPaths: n,
    percentiles,
    gaussPercentiles,
    meanPrice,
    medianPrice,
    expectedReturnPct: (meanPrice / input.s0 - 1) * 100,
    targetPrice: input.targetPrice,
    probAboveTarget,
    probBelowTarget,
    var5Pct,
    cvar5Pct,
    lossProbs,
    medianMaxDrawdownPct,
    p95MaxDrawdownPct,
    histogram: buildHistogram(fat.terminal, gauss.terminal, input.s0),
    fan: buildFan(fat.bands, input.s0),
  };
}

// Shared-bin histogram of terminal returns (%) for fat-tailed vs Gaussian.
function buildHistogram(
  fat: Float64Array,
  gaussPrices: Float64Array,
  s0: number,
): HistBin[] {
  const ret = (a: Float64Array) => Float64Array.from(a, (x) => (x / s0 - 1) * 100);
  const fr = ret(fat);
  const gr = ret(gaussPrices);
  // Range from the fat-tailed sample's robust span, clamped for readability.
  const sortedFr = Float64Array.from(fr).sort();
  let lo = quantileSorted(sortedFr, 0.5);
  let hi = quantileSorted(sortedFr, 99.5);
  lo = Math.max(lo, -95);
  hi = Math.min(hi, 400);
  if (hi - lo < 1) hi = lo + 1;
  const nBins = 36;
  const width = (hi - lo) / nBins;
  const counts = new Array(nBins).fill(0);
  const gcounts = new Array(nBins).fill(0);
  const bucket = (v: number) => Math.min(nBins - 1, Math.max(0, Math.floor((v - lo) / width)));
  for (const v of fr) counts[bucket(v)]++;
  for (const v of gr) gcounts[bucket(v)]++;
  return counts.map((c, i) => ({
    mid: lo + width * (i + 0.5),
    count: c,
    gaussCount: gcounts[i],
  }));
}

// Percentile fan over time from recorded trajectories.
function buildFan(
  bands: { grid: number[]; trajectories: Float64Array[] } | undefined,
  s0: number,
): FanPoint[] {
  if (!bands || bands.trajectories.length === 0) return [];
  const { grid, trajectories } = bands;
  const cols = grid.length;
  const out: FanPoint[] = [];
  for (let c = 0; c < cols; c++) {
    const col = new Float64Array(trajectories.length);
    for (let i = 0; i < trajectories.length; i++) col[i] = trajectories[i][c] ?? s0;
    col.sort();
    out.push({
      t: grid[c],
      p5: quantileSorted(col, 5),
      p25: quantileSorted(col, 25),
      p50: quantileSorted(col, 50),
      p75: quantileSorted(col, 75),
      p95: quantileSorted(col, 95),
    });
  }
  return out;
}
