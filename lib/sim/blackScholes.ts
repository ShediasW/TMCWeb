// Black–Scholes pricing — TypeScript port of `black_scholes` in
// reference/app.py. Used to fairly price option legs so that strategy payoffs
// are net of the premium paid/received. Taleb's point is about the *shape* of
// exposure, but premiums matter: selling cheap convexity vs. buying it is the
// whole fragile/antifragile distinction.

// Abramowitz & Stegun 7.1.26 approximation of the standard normal CDF.
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  let p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  if (x > 0) p = 1 - p;
  return p;
}

export type OptType = "C" | "P";

// Price a European option. S spot, K strike, T years, r risk-free, sigma vol.
export function blackScholes(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  optType: OptType,
): number {
  if (T <= 0 || sigma <= 0) {
    // intrinsic value at expiry / degenerate vol
    return optType === "C" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (optType === "C") {
    return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  }
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}
