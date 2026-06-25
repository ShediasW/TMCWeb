// Seedable pseudo-random number generator + Box–Muller normal sampling.
// Deterministic seeding keeps simulations reproducible (mirrors the
// `np.random.seed(42)` used in reference/app.py) so the fragility verdict is
// stable across re-runs and unit tests.

// mulberry32: tiny, fast, good-enough 32-bit PRNG for Monte Carlo.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;

  constructor(seed = 42) {
    this.next = mulberry32(seed);
  }

  // Uniform on [0, 1).
  uniform(): number {
    return this.next();
  }

  // Uniform on (lo, hi).
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  // Standard normal via Box–Muller.
  normal(): number {
    let u = this.next();
    // avoid log(0)
    if (u < 1e-12) u = 1e-12;
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Poisson sampler (Knuth) — small lambda expected (jump counts per step).
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
}
