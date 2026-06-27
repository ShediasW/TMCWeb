import { describe, it, expect } from "vitest";
import { runPriceForecast, ForecastInput } from "../forecast";

function baseInput(over: Partial<ForecastInput> = {}): ForecastInput {
  return {
    s0: 100,
    tYears: 1,
    r: 0.06,
    baseVol: 0.25,
    jumpIntensity: 1.0,
    tailAlpha: 3,
    swanProb: 0.1,
    swanMagnitude: 0.4,
    swanDirection: -1,
    nPaths: 12000,
    ...over,
  };
}

describe("price forecast distribution", () => {
  it("produces monotonically increasing percentiles", () => {
    const r = runPriceForecast(baseInput());
    for (let i = 1; i < r.percentiles.length; i++) {
      expect(r.percentiles[i].price).toBeGreaterThanOrEqual(r.percentiles[i - 1].price);
    }
  });

  it("target above/below probabilities sum to 1", () => {
    const r = runPriceForecast(baseInput({ targetPrice: 110 }));
    expect(r.probAboveTarget).toBeDefined();
    expect((r.probAboveTarget ?? 0) + (r.probBelowTarget ?? 0)).toBeCloseTo(1, 6);
  });

  it("CVaR (expected shortfall) is no better than VaR", () => {
    const r = runPriceForecast(baseInput());
    expect(r.cvar5Pct).toBeLessThanOrEqual(r.var5Pct);
  });

  it("is reproducible for a fixed seed", () => {
    const a = runPriceForecast(baseInput({ seed: 7 }));
    const b = runPriceForecast(baseInput({ seed: 7 }));
    expect(a.medianPrice).toBe(b.medianPrice);
    expect(a.var5Pct).toBe(b.var5Pct);
  });
});

describe("Taleb's point: fat tails dominate the Gaussian baseline", () => {
  it("the power-law model has a heavier left tail than a matched Gaussian", () => {
    const r = runPriceForecast(baseInput({ swanProb: 0.2, swanMagnitude: 0.5 }));
    const fatP1 = r.percentiles[0].retPct; // P1 return, fat-tailed
    const gaussP1 = r.gaussPercentiles[0].retPct; // P1 return, Gaussian
    // a heavier left tail means a more negative 1st-percentile return
    expect(fatP1).toBeLessThan(gaussP1);
  });

  it("assigns non-trivial probability to deep crashes the Gaussian ignores", () => {
    const r = runPriceForecast(baseInput({ swanProb: 0.25, swanMagnitude: 0.5 }));
    const deep = r.lossProbs.find((l) => l.dropPct === 35)!;
    expect(deep.prob).toBeGreaterThan(0);
  });
});

describe("fan chart + histogram", () => {
  it("emits a time-resolved fan with widening bands", () => {
    const r = runPriceForecast(baseInput());
    expect(r.fan.length).toBeGreaterThan(2);
    const first = r.fan[1];
    const last = r.fan[r.fan.length - 1];
    const widthFirst = first.p95 - first.p5;
    const widthLast = last.p95 - last.p5;
    expect(widthLast).toBeGreaterThan(widthFirst);
  });

  it("builds a shared-bin histogram with both series", () => {
    const r = runPriceForecast(baseInput());
    expect(r.histogram.length).toBeGreaterThan(10);
    const totalFat = r.histogram.reduce((s, b) => s + b.count, 0);
    const totalGauss = r.histogram.reduce((s, b) => s + b.gaussCount, 0);
    expect(totalFat).toBeGreaterThan(0);
    expect(totalGauss).toBeGreaterThan(0);
  });
});
