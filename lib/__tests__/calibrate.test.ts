import { describe, it, expect } from "vitest";
import {
  calibrate,
  logReturns,
  hillTailAlpha,
  alphaToJumpIntensity,
  TRADING_DAYS,
} from "../calibrate";

// Build a synthetic close series with a known daily drift and volatility.
function syntheticCloses(
  n: number,
  dailyMu: number,
  dailySigma: number,
  seed = 1,
): number[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const closes = [100];
  for (let i = 1; i < n; i++) {
    closes.push(closes[i - 1] * Math.exp(dailyMu + dailySigma * normal()));
  }
  return closes;
}

describe("calibration from historical closes", () => {
  it("recovers annualized volatility within tolerance", () => {
    const dailySigma = 0.015; // ~24% annualized
    const closes = syntheticCloses(2000, 0.0003, dailySigma);
    const cal = calibrate(closes);
    const expectedAnnualVol = dailySigma * Math.sqrt(TRADING_DAYS);
    expect(cal.annualVol).toBeGreaterThan(expectedAnnualVol * 0.8);
    expect(cal.annualVol).toBeLessThan(expectedAnnualVol * 1.2);
  });

  it("uses the last close as the current price", () => {
    const closes = [10, 11, 12, 13.5];
    const cal = calibrate(closes);
    expect(cal.s0).toBe(13.5);
  });

  it("drops non-positive / non-finite closes", () => {
    // only the leading 100 -> 110 pair has both ends positive; every pair that
    // touches 0 / -5 / NaN is skipped.
    const rets = logReturns([100, 110, -5, NaN, 121]);
    expect(rets.length).toBe(1);
    expect(rets[0]).toBeCloseTo(Math.log(110 / 100), 6);
  });

  it("returns a sane tail exponent and maps it to jump intensity", () => {
    const closes = syntheticCloses(1500, 0, 0.02);
    const cal = calibrate(closes);
    expect(cal.tailAlpha).toBeGreaterThanOrEqual(1.5);
    expect(cal.tailAlpha).toBeLessThanOrEqual(6);
    expect(cal.jumpIntensity).toBeGreaterThan(0);
  });

  it("heavier tails (smaller alpha) imply more frequent jumps", () => {
    expect(alphaToJumpIntensity(1.5)).toBeGreaterThan(alphaToJumpIntensity(6));
  });

  it("falls back to the cubic law with too little data", () => {
    expect(hillTailAlpha([0.01, -0.02, 0.005])).toBe(3);
  });
});
