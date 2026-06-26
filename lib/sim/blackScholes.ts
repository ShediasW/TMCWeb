// Abramowitz & Stegun approximation — max error 7.5e-8
function normalCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * (Math.abs(x) / Math.SQRT2));
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  return 0.5 * (1.0 + sign * (1.0 - poly * Math.exp(-(x * x) / 2)));
}

export function blackScholes(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: "call" | "put"
): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === "call") {
    return S * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2);
  }
  return K * Math.exp(-r * T) * normalCdf(-d2) - S * normalCdf(-d1);
}
