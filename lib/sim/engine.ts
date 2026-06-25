// High-level engine entry point: turn UI-level parameters into a full result.
// Shared by the Web Worker (production) and the vitest suite (direct call).

import { MarketContext, Strategy } from "./payoff";
import { PathParams } from "./paths";
import {
  DEFAULT_EVAL,
  EvalConfig,
  FragilityResult,
  evaluateFragility,
  payoffCurve,
} from "./fragility";

export interface RunInput {
  strategy: Strategy;
  // market / horizon
  s0: number;
  tYears: number;
  r: number;
  baseVol: number;
  // disorder controls
  jumpIntensity: number;
  swanProb: number;
  swanMagnitude: number;
  swanDirection: number;
  // engine
  nPaths: number;
  capital: number;
}

export interface RunOutput {
  fragility: FragilityResult;
  payoff: { price: number; pnlPct: number }[];
}

export function runSimulation(input: RunInput): RunOutput {
  const mkt: MarketContext = {
    s0: input.s0,
    tYears: input.tYears,
    r: input.r,
    pricingVol: input.baseVol, // option entry prices fixed at base vol
  };

  const pathParams: Omit<PathParams, "seed" | "baseVol"> = {
    s0: input.s0,
    tYears: input.tYears,
    r: input.r,
    nPaths: input.nPaths,
    steps: 30,
    jumpIntensity: input.jumpIntensity,
    swanProb: input.swanProb,
    swanMagnitude: input.swanMagnitude,
    swanDirection: input.swanDirection,
  };

  const cfg: EvalConfig = { ...DEFAULT_EVAL, capital: input.capital };

  const fragility = evaluateFragility(input.strategy, mkt, pathParams, input.baseVol, cfg);
  const payoff = payoffCurve(input.strategy, mkt, input.capital);

  return { fragility, payoff };
}

export type { Strategy };
