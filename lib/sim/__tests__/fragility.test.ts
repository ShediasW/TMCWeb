import { describe, it, expect } from "vitest";
import { runSimulation, RunInput } from "../engine";
import { getPreset } from "../strategies";
import { blackScholes } from "../blackScholes";

function baseInput(strategyId: string): RunInput {
  const strategy = getPreset(strategyId)!;
  return {
    strategy,
    s0: 100,
    tYears: 1,
    r: 0.045,
    baseVol: 0.2,
    jumpIntensity: 1.0,
    swanProb: 0.1,
    swanMagnitude: 0.5,
    swanDirection: -1,
    nPaths: 8000,
    capital: 100000,
  };
}

describe("Black–Scholes port", () => {
  it("prices an ATM call positively and respects put–call parity", () => {
    const S = 100,
      K = 100,
      T = 1,
      r = 0.045,
      sig = 0.2;
    const c = blackScholes(S, K, T, r, sig, "C");
    const p = blackScholes(S, K, T, r, sig, "P");
    expect(c).toBeGreaterThan(0);
    expect(p).toBeGreaterThan(0);
    // C - P = S - K e^{-rT}
    const parity = S - K * Math.exp(-r * T);
    expect(c - p).toBeCloseTo(parity, 1);
  });
});

describe("fragility verdicts (the core claim)", () => {
  it("long OTM call (barbell) is ANTIFRAGILE: convexity > 0", () => {
    const { fragility } = runSimulation(baseInput("barbell"));
    expect(fragility.convexityIndex).toBeGreaterThan(0);
    expect(fragility.verdict).toBe("ANTIFRAGILE");
  });

  it("short strangle is FRAGILE: convexity < 0", () => {
    const { fragility } = runSimulation(baseInput("short_vol"));
    expect(fragility.convexityIndex).toBeLessThan(0);
    expect(fragility.verdict).toBe("FRAGILE");
  });

  it("all cash is ROBUST: convexity ~ 0", () => {
    const { fragility } = runSimulation(baseInput("all_cash"));
    expect(fragility.verdict).toBe("ROBUST");
    expect(Math.abs(fragility.convexityIndex)).toBeLessThan(0.25);
    expect(fragility.ruinProb).toBe(0);
  });

  it("naked put selling is FRAGILE and carries real ruin probability", () => {
    const { fragility } = runSimulation(baseInput("naked_put"));
    expect(fragility.verdict).toBe("FRAGILE");
    // with a 10% swan probability of a 50% crash, short puts must show ruin risk
    expect(fragility.ruinProb).toBeGreaterThan(0);
  });
});

describe("survival gate & tail shape", () => {
  it("barbell caps its worst loss near the premium spent (~10% of capital)", () => {
    const { fragility } = runSimulation(baseInput("barbell"));
    // worst loss should not blow far past the 10% allocated to calls
    expect(fragility.worstLossPct).toBeGreaterThan(-15);
    expect(fragility.ruinProb).toBe(0);
  });

  it("antifragile strategies have positive tail asymmetry (upside tail > downside tail)", () => {
    const { fragility } = runSimulation(baseInput("barbell"));
    expect(fragility.tailAsymmetry).toBeGreaterThan(1);
  });
});

describe("payoff curve", () => {
  it("returns a monotone-ish convex curve for a long call barbell", () => {
    const { payoff } = runSimulation(baseInput("barbell"));
    expect(payoff.length).toBeGreaterThan(10);
    // last point (high price) should be far above the first (low price)
    expect(payoff[payoff.length - 1].pnlPct).toBeGreaterThan(payoff[0].pnlPct);
  });
});
