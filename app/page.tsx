"use client";

import { useState } from "react";
import StrategyBuilder, { SimParams } from "@/components/StrategyBuilder";
import StrategyCompare from "@/components/StrategyCompare";
import FragilityVerdict from "@/components/FragilityVerdict";
import PayoffChart from "@/components/PayoffChart";
import PnlHistogram from "@/components/PnlHistogram";
import FragilityCurve from "@/components/FragilityCurve";
import { useSimulation } from "@/lib/useSimulation";
import { RunInput, RunOutput } from "@/lib/sim/engine";
import { getPreset } from "@/lib/sim/strategies";

const S0 = 100;
const CAPITAL = 100000;

const DEFAULT_PARAMS: SimParams = {
  strategyId: "barbell",
  baseVol: 0.2,
  tYears: 1,
  swanProb: 0.1,
  swanMagnitude: 0.5,
  swanDirection: -1,
  jumpIntensity: 1.0,
  nPaths: 15000,
};

export default function Page() {
  const { run, runPrimary, running } = useSimulation();
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<RunOutput | null>(null);
  const [tab, setTab] = useState<"single" | "compare">("single");

  async function handleRun() {
    const strategy = getPreset(params.strategyId);
    if (!strategy) return;
    const input: RunInput = {
      strategy,
      s0: S0,
      tYears: params.tYears,
      r: 0.045,
      baseVol: params.baseVol,
      jumpIntensity: params.jumpIntensity,
      swanProb: params.swanProb,
      swanMagnitude: params.swanMagnitude,
      swanDirection: params.swanDirection,
      nPaths: params.nPaths,
      capital: CAPITAL,
    };
    const out = await runPrimary(input);
    setResult(out);
  }

  return (
    <div className="container">
      <h1>🦢 블랙스완 프래질리티 시뮬레이터</h1>
      <p className="subtitle">
        나심 탈레브 기반. 핵심은 <b>예측이 맞느냐가 아니라, 예측에 근거한 행동(전략)이
        블랙스완 앞에서 프래질한가</b>를 평가하는 것. 먼저 생존(파산 회피), 그 다음 볼록성.
      </p>

      <div className="tabs">
        <button
          className={tab === "single" ? "active" : ""}
          onClick={() => setTab("single")}
        >
          단일 전략 평가
        </button>
        <button
          className={tab === "compare" ? "active" : ""}
          onClick={() => setTab("compare")}
        >
          전략 비교
        </button>
      </div>

      <StrategyBuilder
        params={params}
        setParams={setParams}
        onRun={handleRun}
        running={running}
      />

      {tab === "single" ? (
        result ? (
          <>
            <FragilityVerdict r={result.fragility} />
            <PayoffChart data={result.payoff} s0={S0} />
            <FragilityCurve data={result.fragility.volSweep} />
            <PnlHistogram sample={result.fragility.pnlSample} />
          </>
        ) : (
          <div className="panel">
            <p className="desc" style={{ margin: 0 }}>
              전략과 블랙스완 가정을 고른 뒤 <b>실행</b>을 누르세요. 몬테카를로가 브라우저에서
              돌며 손익의 곡률·파산확률·꼬리 분포를 계산합니다.
            </p>
          </div>
        )
      ) : (
        <StrategyCompare params={params} run={run} />
      )}

      <p className="subtitle" style={{ marginTop: 24 }}>
        ⚠️ 교육용 시뮬레이터입니다. 합성 데이터 기반이며 투자 자문이 아닙니다.
      </p>
    </div>
  );
}
