// Strategy / leg model and P&L computation.
//
// A Strategy is initial capital + a list of Legs. Each leg is sized by `weight`
// (fraction of capital used as premium/notional) and a direction (+1 long / -1
// short). We deliberately unify stock and options under one formula:
//
//     legPnl = dir * qty * (payoff(S_T) - entryPrice)
//     qty    = weight * capital / entryPrice
//
// where for a stock entryPrice = S0 and payoff = S_T, and for an option
// entryPrice = Black–Scholes premium and payoff = max(S_T-K,0) / max(K-S_T,0).
//
// This makes the fragile/antifragile distinction fall out naturally:
//  - Long OTM option: bounded loss (the premium), convex unbounded upside.
//  - Short option: bounded gain (the premium), concave catastrophic downside.

import { blackScholes, OptType } from "./blackScholes";

export type LegKind = "cash" | "stock" | "call" | "put";

export interface Leg {
  kind: LegKind;
  dir: 1 | -1; // +1 long, -1 short
  weight: number; // fraction of capital allocated to this leg
  moneyness?: number; // strike = S0 * moneyness (options only)
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  legs: Leg[];
}

export interface MarketContext {
  s0: number;
  tYears: number;
  r: number;
  // Volatility used to PRICE the option legs at entry. Kept separate from the
  // simulation's realized vol so we can stress realized disorder while entry
  // prices stay fixed (the essence of the Taleb–Douady perturbation).
  pricingVol: number;
}

// Entry price (cost basis) of one unit of a leg.
function entryPrice(leg: Leg, mkt: MarketContext): number {
  switch (leg.kind) {
    case "cash":
      return 1; // 1 currency unit of cash
    case "stock":
      return mkt.s0;
    case "call":
    case "put": {
      const K = mkt.s0 * (leg.moneyness ?? 1);
      const opt: OptType = leg.kind === "call" ? "C" : "P";
      const px = blackScholes(mkt.s0, K, mkt.tYears, mkt.r, mkt.pricingVol, opt);
      // floor to avoid div-by-zero on deeply OTM cheap options
      return Math.max(px, mkt.s0 * 1e-4);
    }
  }
}

// Terminal payoff of one unit of a leg given terminal price sT.
function unitPayoff(leg: Leg, mkt: MarketContext, sT: number): number {
  switch (leg.kind) {
    case "cash":
      return Math.exp(mkt.r * mkt.tYears); // 1 unit of cash grows at r
    case "stock":
      return sT;
    case "call":
      return Math.max(sT - mkt.s0 * (leg.moneyness ?? 1), 0);
    case "put":
      return Math.max(mkt.s0 * (leg.moneyness ?? 1) - sT, 0);
  }
}

// P&L (currency) of an entire strategy on one path, given terminal price sT.
export function strategyPnl(
  strat: Strategy,
  mkt: MarketContext,
  capital: number,
  sT: number,
): number {
  let pnl = 0;
  for (const leg of strat.legs) {
    const entry = entryPrice(leg, mkt);
    const qty = (leg.weight * capital) / entry;
    pnl += leg.dir * qty * (unitPayoff(leg, mkt, sT) - entry);
  }
  return pnl;
}

// Vectorized P&L across many terminal prices. Pre-computes per-leg entry price
// and quantity once, then sweeps the price array — important for performance on
// a phone running tens of thousands of paths.
export function strategyPnlVector(
  strat: Strategy,
  mkt: MarketContext,
  capital: number,
  terminal: Float64Array,
): Float64Array {
  const n = terminal.length;
  const out = new Float64Array(n);
  for (const leg of strat.legs) {
    const entry = entryPrice(leg, mkt);
    const qty = (leg.weight * capital) / entry;
    const signedQty = leg.dir * qty;
    for (let i = 0; i < n; i++) {
      out[i] += signedQty * (unitPayoff(leg, mkt, terminal[i]) - entry);
    }
  }
  return out;
}
