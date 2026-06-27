// Calibrate the simulation from a stock's historical daily closes.
//
// Taleb's point is that markets live in "Extremistan": daily returns are
// fat-tailed, so a calibration that only reports mean/vol (the Gaussian
// summary) hides exactly the risk we care about. We therefore also estimate
// the power-law TAIL EXPONENT (Hill estimator) from the empirical return
// distribution, and translate it into the jump/black-swan controls the
// fat-tailed path engine consumes.

export const TRADING_DAYS = 252;

export interface Calibration {
  s0: number; // last close (current price)
  annualDrift: number; // annualized mean log return (mu)
  annualVol: number; // annualized stdev of log returns (sigma)
  tailAlpha: number; // Hill power-law tail exponent (smaller => heavier tail)
  nReturns: number; // number of daily returns used
  // suggested fat-tail engine controls derived from the data
  jumpIntensity: number; // annual Poisson intensity of ordinary jumps
}

// Daily log returns from a close series (oldest -> newest).
export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  let s = 0;
  for (const x of xs) s += (x - mu) * (x - mu);
  return Math.sqrt(s / (xs.length - 1));
}

// Hill estimator of the tail index alpha from the largest |returns|.
// alpha ~= 1 / mean(log(x_(i) / x_(k))) over the top-k absolute returns.
// Typical equity daily returns give alpha ~ 3 (the "inverse cubic law").
export function hillTailAlpha(returns: number[]): number {
  const abs = returns.map(Math.abs).filter((x) => x > 0).sort((a, b) => b - a);
  const n = abs.length;
  if (n < 20) return 3; // not enough data — fall back to the cubic-law default
  const k = Math.max(10, Math.floor(n * 0.05)); // top 5% as the tail
  const xk = abs[k]; // threshold (k-th largest)
  if (xk <= 0) return 3;
  let s = 0;
  for (let i = 0; i < k; i++) s += Math.log(abs[i] / xk);
  const alpha = k / s;
  // keep in a sane band; heavy but finite-variance tails for equities
  return Math.min(6, Math.max(1.5, alpha));
}

// Map an estimated tail exponent to an annual ordinary-jump intensity: heavier
// tails (smaller alpha) imply more frequent fat-tailed jumps in the engine.
export function alphaToJumpIntensity(alpha: number): number {
  // alpha 1.5 -> ~2.5 jumps/yr, alpha 3 -> ~1.0, alpha 6 -> ~0.3
  const v = 3 / alpha;
  return Math.min(3, Math.max(0.2, Math.round(v * 10) / 10));
}

// Build a calibration directly from user-supplied numbers, for the manual
// fallback path (no historical series available — e.g. no API key, or the
// data provider is unreachable). Tail exponent defaults to the equity cubic law.
export function manualCalibration(opts: {
  price: number;
  annualVol: number;
  annualDrift?: number;
  tailAlpha?: number;
}): Calibration {
  const tailAlpha = clampAlpha(opts.tailAlpha ?? 3);
  return {
    s0: opts.price,
    annualDrift: opts.annualDrift ?? 0.08,
    annualVol: opts.annualVol,
    tailAlpha,
    nReturns: 0,
    jumpIntensity: alphaToJumpIntensity(tailAlpha),
  };
}

function clampAlpha(a: number): number {
  return Math.min(6, Math.max(1.5, a));
}

export function calibrate(closes: number[]): Calibration {
  const clean = closes.filter((c) => Number.isFinite(c) && c > 0);
  const s0 = clean.length ? clean[clean.length - 1] : 0;
  const rets = logReturns(clean);
  const mu = mean(rets);
  const sd = stdev(rets, mu);
  const tailAlpha = hillTailAlpha(rets);
  return {
    s0,
    annualDrift: mu * TRADING_DAYS,
    annualVol: sd * Math.sqrt(TRADING_DAYS),
    tailAlpha,
    nReturns: rets.length,
    jumpIntensity: alphaToJumpIntensity(tailAlpha),
  };
}
