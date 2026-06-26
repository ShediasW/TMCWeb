import { describe, it, expect } from "vitest";
import { run } from "./engine";
import { getPreset } from "./strategies";

const BASE_INPUT = {
  s0: 100,
  tYears: 1,
  r: 0.045,
  baseVol: 0.2,
  jumpIntensity: 1.0,
  swanProb: 0.1,
  swanMagnitude: 0.5,
  swanDirection: -1 as const,
  nPaths: 6000,
  capital: 100_000,
};

describe("fragility engine — strategy verdicts", () => {
  it("barbell is ANTIFRAGILE (convexityIndex > 0)", () => {
    const strategy = getPreset("barbell")!;
    const { fragility } = run({ ...BASE_INPUT, strategy });
    expect(fragility.verdict).toBe("ANTIFRAGILE");
    expect(fragility.convexityIndex).toBeGreaterThan(0);
  });

  it("short-vol is FRAGILE (convexityIndex < 0)", () => {
    const strategy = getPreset("short-vol")!;
    const { fragility } = run({ ...BASE_INPUT, strategy });
    expect(fragility.verdict).toBe("FRAGILE");
    expect(fragility.convexityIndex).toBeLessThan(0);
  });

  it("cash is ROBUST (|convexityIndex| ≤ 2)", () => {
    const strategy = getPreset("cash")!;
    const { fragility } = run({ ...BASE_INPUT, strategy });
    expect(fragility.verdict).toBe("ROBUST");
    expect(Math.abs(fragility.convexityIndex)).toBeLessThanOrEqual(2);
  });

  it("payoff curve has correct shape for barbell (call tail present)", () => {
    const strategy = getPreset("barbell")!;
    const { payoff } = run({ ...BASE_INPUT, strategy });
    const highPrice = payoff.find((p) => p.price >= 160);
    const lowPrice = payoff.find((p) => p.price <= 50);
    // Barbell: large upside potential, limited downside
    expect(highPrice!.pnlPct).toBeGreaterThan(50);
    expect(lowPrice!.pnlPct).toBeGreaterThan(-15);
  });

  it("ruinProb is between 0 and 1", () => {
    const strategy = getPreset("buy-and-hold")!;
    const { fragility } = run({ ...BASE_INPUT, strategy });
    expect(fragility.ruinProb).toBeGreaterThanOrEqual(0);
    expect(fragility.ruinProb).toBeLessThanOrEqual(1);
  });
});
