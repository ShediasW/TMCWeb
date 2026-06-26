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
  // Black Swan controls
  swanProb: number; // probability of at least one swan over the horizon
  swanMagnitude: number; // shock size as a fraction (e.g. 0.5 = 50%)
  swanDirection: number; // -1 crash, +1 melt-up, 0 random
  seed: number;
}

import { Rng } from "./rng";

// Generate terminal prices S_T for nPaths. Returns a Float64Array of length
// nPaths. We only need terminal price for European payoffs, but we track the
// running minimum so callers can reason about path-dependent ruin / drawdown.
export interface PathResult {
  terminal: Float64Array; // S_T per path
  minRatio: Float64Array; // min(S_t)/S0 per path — worst intra-horizon drawdown
}

export function simulatePaths(p: PathParams): PathResult {
  const rng = new Rng(p.seed);
  const dt = p.tYears / p.steps;
  // Convert horizon swan probability into a per-step probability so that
  // P(no swan over all steps) = (1 - perStep)^steps = 1 - swanProb.
  const perStepSwan =
    p.swanProb <= 0 ? 0 : 1 - Math.pow(1 - Math.min(p.swanProb, 0.999999), 1 / p.steps);

  const terminal = new Float64Array(p.nPaths);
  const minRatio = new Float64Array(p.nPaths);

  for (let i = 0; i < p.nPaths; i++) {
    let price = p.s0;
    let vol = p.baseVol;
    let minPrice = p.s0;

    for (let s = 0; s < p.steps; s++) {
      const z = rng.normal();

      // --- ordinary fat-tailed jumps (power-law magnitude, as in app.py) ---
      let jump = 0;
      const nJ = rng.poisson(p.jumpIntensity * dt);
      for (let j = 0; j < nJ; j++) {
        const u = rng.range(0.001, 0.999);
        const dir = rng.uniform() > 0.5 ? 1 : -1;
        // 0.15 / (1-u)^(1/3): heavy right tail in magnitude
        const size = (0.15 / Math.pow(1 - u, 1 / 3)) * dir;
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

      // vol mean-reversion toward base (decay 0.85, floored at base)
      const decayed = vol * 0.85;
      vol = decayed < p.baseVol ? p.baseVol : decayed;
    }

    terminal[i] = price;
    minRatio[i] = minPrice / p.s0;
  }

  return { terminal, minRatio };
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
