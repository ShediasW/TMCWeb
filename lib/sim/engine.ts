import { blackScholes } from "./blackScholes";
import { Strategy, Leg } from "./strategies";
import { FragilityResult } from "./fragility";

export interface RunInput {
  strategy: Strategy;
  s0: number;
  tYears: number;
  r: number;
  baseVol: number;
  jumpIntensity: number;
  swanProb: number;
  swanMagnitude: number;
  swanDirection: number; // -1 crash · +1 melt-up · 0 random
  nPaths: number;
  capital: number;
}

export interface RunOutput {
  fragility: FragilityResult;
  payoff: { price: number; pnlPct: number }[];
}

// ─── RNG ──────────────────────────────────────────────────────────────────────

function normalRand(): number {
  // Box-Muller
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function poissonSample(lambda: number): number {
  // Knuth algorithm; capped at 15 to avoid infinite loops for large λ
  if (lambda <= 0) return 0;
  const L = Math.exp(-Math.min(lambda, 15));
  let k = 0, p = 1.0;
  do { p *= Math.random() || 1e-10; k++; } while (p > L && k < 15);
  return k - 1;
}

// ─── PATH GENERATION (Bates jump-diffusion) ───────────────────────────────────

function simTerminals(
  s0: number, T: number, r: number, sigma: number,
  jumpIntensity: number, swanProb: number, swanMagnitude: number,
  swanDirection: number, nPaths: number
): Float64Array {
  const STEPS = 12;
  const dt = T / STEPS;
  const sqDt = Math.sqrt(dt);
  const out = new Float64Array(nPaths);

  for (let i = 0; i < nPaths; i++) {
    let S = s0;
    let lVol = sigma;
    let swanFired = false;

    for (let t = 0; t < STEPS; t++) {
      let lr = (r - 0.5 * lVol * lVol) * dt + lVol * sqDt * normalRand();

      // Power-law jumps
      const nJ = poissonSample(jumpIntensity * dt);
      for (let j = 0; j < nJ; j++) {
        const u = Math.random() * 0.998 + 0.001;
        const dir = Math.random() < 0.5 ? 1 : -1;
        // Power-law tail: F^{-1}(u) where F(x) = 1 - (0.15/x)^3
        const jSize = Math.min(dir * 0.15 / Math.pow(1 - u, 1 / 3), 1.0);
        lr += jSize;
        lVol = Math.min(lVol * (1 + Math.abs(jSize) * 0.3), sigma * 3);
      }

      // Black-swan shock (injected at most once per path)
      if (!swanFired && Math.random() < swanProb * dt) {
        swanFired = true;
        const dir =
          swanDirection === 0 ? (Math.random() < 0.5 ? 1 : -1) : swanDirection;
        lr += dir * swanMagnitude;
        lVol = Math.min(lVol * 2, sigma * 4);
      }

      // GBM step with log-return cap to prevent numerical blow-up
      S = Math.max(S * Math.exp(Math.max(lr, -3)), 1e-4);
      // Vol mean-reversion
      lVol = Math.max(lVol * 0.88, sigma);
    }

    out[i] = S;
  }
  return out;
}

// ─── PAYOFF CALCULATION ───────────────────────────────────────────────────────

// pricingVol = implied vol at position entry (fixed, used for BS pricing).
// sT = terminal price from simulation (at whatever scenario vol was used).
function legPnlFrac(
  leg: Leg, s0: number, sT: number, T: number, r: number, pricingVol: number
): number {
  const K = leg.strikeRatio * s0;
  const f = leg.fraction;

  switch (leg.type) {
    case "cash":
      return f * (Math.exp(r * T) - 1);

    case "stock":
      return f * (sT / s0 - 1) * (leg.side === "long" ? 1 : -1);

    case "call": {
      const P = blackScholes(s0, K, T, r, pricingVol, "call");
      if (P < 1e-6) return 0;
      const intrinsic = Math.max(sT - K, 0);
      return leg.side === "long"
        ? f * (intrinsic / P - 1)
        : f * (1 - intrinsic / P);
    }

    case "put": {
      const P = blackScholes(s0, K, T, r, pricingVol, "put");
      if (P < 1e-6) return 0;
      const intrinsic = Math.max(K - sT, 0);
      return leg.side === "long"
        ? f * (intrinsic / P - 1)
        : f * (1 - intrinsic / P);
    }
  }
}

// pricingVol: vol used to price options at entry. simulationVol: only used by callers
// for path generation — not passed here; sT already reflects the scenario.
function stratPnlPct(
  strategy: Strategy, s0: number, sT: number, T: number, r: number, pricingVol: number
): number {
  return (
    strategy.legs.reduce(
      (sum, leg) => sum + legPnlFrac(leg, s0, sT, T, r, pricingVol),
      0
    ) * 100
  );
}

// ─── PAYOFF CURVE (analytical, for chart) ─────────────────────────────────────

function buildPayoffCurve(
  strategy: Strategy, s0: number, T: number, r: number, sigma: number
): { price: number; pnlPct: number }[] {
  const N = 60;
  const result: { price: number; pnlPct: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const price = s0 * (0.3 + 1.7 * (i / N));
    result.push({ price, pnlPct: stratPnlPct(strategy, s0, price, T, r, sigma) });
  }
  return result;
}

// ─── FRAGILITY METRICS (Taleb-Douady heuristic) ──────────────────────────────

function computeFragility(
  strategy: Strategy, s0: number, T: number, r: number, baseVol: number,
  jumpIntensity: number, swanProb: number, swanMagnitude: number,
  swanDirection: number, nPaths: number
): FragilityResult {
  // Main Monte-Carlo run
  const terminals = simTerminals(
    s0, T, r, baseVol, jumpIntensity, swanProb, swanMagnitude, swanDirection, nPaths
  );
  // Options priced at baseVol (the vol at position entry)
  const pnls = Array.from(terminals).map((sT) =>
    stratPnlPct(strategy, s0, sT, T, r, baseVol)
  );

  // Survival gate: P(loss > 50% of capital)
  const ruinProb = pnls.filter((p) => p < -50).length / nPaths;

  const worstLossPct = Math.min(...pnls);

  // Tail asymmetry: mean top-5% gain / |mean bottom-5% loss|
  const sorted = [...pnls].sort((a, b) => a - b);
  const n5 = Math.max(1, Math.floor(nPaths * 0.05));
  const bottomMean = sorted.slice(0, n5).reduce((s, v) => s + v, 0) / n5;
  const topMean = sorted.slice(-n5).reduce((s, v) => s + v, 0) / n5;
  const tailAsymmetry =
    Math.abs(bottomMean) > 1e-6 ? topMean / Math.abs(bottomMean) : Infinity;

  // Fragility curve: mean P&L at 6 volatility scales
  const VOL_SCALES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const SWEEP_N = 2000;
  const volSweep = VOL_SCALES.map((volScale) => {
    const sv = baseVol * volScale;
    // Simulate paths at sv but price options at baseVol (entry vol — fixed at purchase).
    const st = simTerminals(s0, T, r, sv, jumpIntensity, swanProb, swanMagnitude, swanDirection, SWEEP_N);
    const sp = Array.from(st).map((sT) => stratPnlPct(strategy, s0, sT, T, r, baseVol));
    const meanPnlPct = sp.reduce((s, v) => s + v, 0) / SWEEP_N;
    return { volScale, meanPnlPct };
  });

  // Convexity index: Taleb-Douady second derivative proxy
  const pnlHigh = volSweep.find((v) => v.volScale === 1.5)!.meanPnlPct;
  const pnlLow = volSweep.find((v) => v.volScale === 0.5)!.meanPnlPct;
  const convexityIndex = pnlHigh - pnlLow;

  const verdict: FragilityResult["verdict"] =
    convexityIndex > 2 ? "ANTIFRAGILE" : convexityIndex < -2 ? "FRAGILE" : "ROBUST";

  // Subsample for histogram display (≤ 600 points)
  const step = Math.max(1, Math.floor(nPaths / 600));
  const pnlSample = pnls.filter((_, i) => i % step === 0);

  return {
    verdict,
    convexityIndex,
    ruinProb,
    worstLossPct,
    tailAsymmetry,
    volSweep,
    pnlSample,
  };
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function run(input: RunInput): RunOutput {
  const { strategy, s0, tYears, r, baseVol, jumpIntensity,
          swanProb, swanMagnitude, swanDirection, nPaths } = input;

  const fragility = computeFragility(
    strategy, s0, tYears, r, baseVol, jumpIntensity,
    swanProb, swanMagnitude, swanDirection, nPaths
  );
  const payoff = buildPayoffCurve(strategy, s0, tYears, r, baseVol);

  return { fragility, payoff };
}
