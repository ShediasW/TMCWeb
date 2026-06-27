// Synthetic price-path generator with fat tails + Black Swan injection.
// TypeScript port of `bates_stress_paths_optimized` from reference/app.py.
//
// Why not plain Gaussian GBM? Taleb's central critique is that real markets
// live in "Extremistan": returns are fat-tailed and dominated by rare jumps.
// A Gaussian model would make every strategy look equally (un)safe and hide
// fragility. So we layer three sources of disorder on top of GBM:
//   1. Poisson jumps with a power-law magnitude (the everyday fat tail).
//   2. Volatility clustering (a jump raises vol, which mean-reverts).
//   3. A user-controlled Black Swan: a rare, large, forced shock — the
//      scenario whose survival is the whole point of the simulator.

export interface PathParams {
  s0: number; // starting price
  tYears: number; // horizon in years
  baseVol: number; // annualized base volatility
  r: number; // risk-free / drift rate
  nPaths: number;
  steps: number; // time steps per path
  jumpIntensity: number; // annual Poisson intensity (lambda) of ordinary jumps
  // Power-law tail exponent of the ordinary jump magnitude. Smaller => heavier
  // tail. Defaults to 3 (the empirical "inverse cubic law" for equities), which
  // reproduces the original 0.15/(1-u)^(1/3) magnitude.
  tailAlpha?: number;
  // Black Swan controls
  swanProb: number; // probability of at least one swan over the horizon
  swanMagnitude: number; // shock size as a fraction (e.g. 0.5 = 50%)
  swanDirection: number; // -1 crash, +1 melt-up, 0 random
  seed: number;
  // Optional: record price trajectories for a capped subset of paths on a
  // coarse time grid, so callers can draw percentile fan charts without holding
  // every full path in memory (important on phones with large nPaths).
  recordBands?: { count: number; gridSteps: number };
}

import { Rng } from "./rng";

// Generate terminal prices S_T for nPaths. Returns a Float64Array of length
// nPaths. We only need terminal price for European payoffs, but we track the
// running minimum so callers can reason about path-dependent ruin / drawdown.
export interface PathResult {
  terminal: Float64Array; // S_T per path
  minRatio: Float64Array; // min(S_t)/S0 per path — worst intra-horizon drawdown
  // Present only when recordBands was requested. `grid` holds the fractional
  // time (0..1) at each recorded column; `trajectories[i]` is one recorded
  // path's price at those times. Used to build percentile fan charts.
  bands?: { grid: number[]; trajectories: Float64Array[] };
}

export function simulatePaths(p: PathParams): PathResult {
  const rng = new Rng(p.seed);
  const dt = p.tYears / p.steps;
  // Convert horizon swan probability into a per-step probability so that
  // P(no swan over all steps) = (1 - perStep)^steps = 1 - swanProb.
  const perStepSwan =
    p.swanProb <= 0 ? 0 : 1 - Math.pow(1 - Math.min(p.swanProb, 0.999999), 1 / p.steps);

  // Power-law magnitude exponent. size = c / (1-u)^(1/alpha) has tail index
  // alpha; alpha = 3 reproduces the original engine (c = 0.15, exponent 1/3).
  const alpha = p.tailAlpha && p.tailAlpha > 0 ? p.tailAlpha : 3;
  const invAlpha = 1 / alpha;

  const terminal = new Float64Array(p.nPaths);
  const minRatio = new Float64Array(p.nPaths);

  // Optional fan-chart recording: capture a coarse time grid for the first
  // `bandCount` paths (sampling is unbiased — paths are i.i.d.).
  const bandCount = p.recordBands ? Math.min(p.recordBands.count, p.nPaths) : 0;
  const gridSteps = p.recordBands ? Math.max(2, Math.min(p.recordBands.gridSteps, p.steps)) : 0;
  const recordEvery = gridSteps ? Math.max(1, Math.floor(p.steps / gridSteps)) : 0;
  const grid: number[] = [];
  const trajectories: Float64Array[] = [];

  for (let i = 0; i < p.nPaths; i++) {
    let price = p.s0;
    let vol = p.baseVol;
    let minPrice = p.s0;
    const recordThis = i < bandCount;
    const traj: number[] = recordThis ? [p.s0] : [];
    if (recordThis && i === 0) grid.push(0);

    for (let s = 0; s < p.steps; s++) {
      const z = rng.normal();

      // --- ordinary fat-tailed jumps (power-law magnitude, as in app.py) ---
      let jump = 0;
      const nJ = rng.poisson(p.jumpIntensity * dt);
      for (let j = 0; j < nJ; j++) {
        const u = rng.range(0.001, 0.999);
        const dir = rng.uniform() > 0.5 ? 1 : -1;
        // 0.15 / (1-u)^(1/alpha): heavy tail in magnitude, tail index = alpha
        const size = (0.15 / Math.pow(1 - u, invAlpha)) * dir;
        jump += size;
        vol *= 1 + Math.abs(size); // vol clustering
      }

      // --- Black Swan injection (rare, large, forced) ---
      if (perStepSwan > 0 && rng.uniform() < perStepSwan) {
        const dir =
          p.swanDirection === 0 ? (rng.uniform() > 0.5 ? 1 : -1) : p.swanDirection;
        jump += p.swanMagnitude * dir;
        vol *= 2.0;
      }

      const drift = (p.r - 0.5 * vol * vol) * dt;
      price *= Math.exp(drift + vol * Math.sqrt(dt) * z + jump);
      if (price < minPrice) minPrice = price;

      if (recordThis && recordEvery && ((s + 1) % recordEvery === 0 || s === p.steps - 1)) {
        traj.push(price);
        if (i === 0) grid.push((s + 1) / p.steps);
      }

      // vol mean-reversion toward base (decay 0.85, floored at base)
      const decayed = vol * 0.85;
      vol = decayed < p.baseVol ? p.baseVol : decayed;
    }

    terminal[i] = price;
    minRatio[i] = minPrice / p.s0;
    if (recordThis) trajectories.push(Float64Array.from(traj));
  }

  const result: PathResult = { terminal, minRatio };
  if (bandCount > 0) result.bands = { grid, trajectories };
  return result;
}

// Sensible defaults for a 1-year horizon. baseVol ~20% is typical S&P.
export const DEFAULT_PATH_PARAMS: Omit<PathParams, "seed"> = {
  s0: 100,
  tYears: 1,
  baseVol: 0.2,
  r: 0.045,
  nPaths: 15000,
  steps: 30,
  jumpIntensity: 1.0,
  swanProb: 0.1,
  swanMagnitude: 0.5,
  swanDirection: -1,
};
