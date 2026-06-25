"use client";

import { PRESET_STRATEGIES, getPreset } from "@/lib/sim/strategies";

export interface SimParams {
  strategyId: string;
  baseVol: number;
  tYears: number;
  swanProb: number;
  swanMagnitude: number;
  swanDirection: number;
  jumpIntensity: number;
  nPaths: number;
}

export default function StrategyBuilder({
  params,
  setParams,
  onRun,
  running,
}: {
  params: SimParams;
  setParams: (p: SimParams) => void;
  onRun: () => void;
  running: boolean;
}) {
  const set = <K extends keyof SimParams>(k: K, v: SimParams[K]) =>
    setParams({ ...params, [k]: v });

  const preset = getPreset(params.strategyId);

  return (
    <div className="panel">
      <h2>① 전략 (예측에 근거한 행동)</h2>
      <label>프리셋 전략</label>
      <select
        value={params.strategyId}
        onChange={(e) => set("strategyId", e.target.value)}
      >
        {PRESET_STRATEGIES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {preset && <p className="desc">{preset.description}</p>}

      <h2 style={{ marginTop: 18 }}>② 블랙스완 / 무질서 가정</h2>

      <div className="row">
        <label style={{ margin: 0 }}>블랙스완 발생 확률</label>
        <span className="val">{(params.swanProb * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={0.5}
        step={0.01}
        value={params.swanProb}
        onChange={(e) => set("swanProb", parseFloat(e.target.value))}
      />

      <div className="row">
        <label style={{ margin: 0 }}>블랙스완 충격 크기</label>
        <span className="val">{(params.swanMagnitude * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min={0.1}
        max={0.9}
        step={0.05}
        value={params.swanMagnitude}
        onChange={(e) => set("swanMagnitude", parseFloat(e.target.value))}
      />

      <label>충격 방향</label>
      <select
        value={params.swanDirection}
        onChange={(e) => set("swanDirection", parseInt(e.target.value))}
      >
        <option value={-1}>크래시 (하락)</option>
        <option value={1}>멜트업 (급등)</option>
        <option value={0}>무작위 (양방향)</option>
      </select>

      <div className="grid2" style={{ marginTop: 4 }}>
        <div>
          <div className="row">
            <label style={{ margin: 0 }}>기반 변동성</label>
            <span className="val">{(params.baseVol * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0.05}
            max={0.6}
            step={0.01}
            value={params.baseVol}
            onChange={(e) => set("baseVol", parseFloat(e.target.value))}
          />
        </div>
        <div>
          <div className="row">
            <label style={{ margin: 0 }}>점프 강도(λ)</label>
            <span className="val">{params.jumpIntensity.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={params.jumpIntensity}
            onChange={(e) => set("jumpIntensity", parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 8 }}>
        <div>
          <label>투자 기간(년)</label>
          <select
            value={params.tYears}
            onChange={(e) => set("tYears", parseFloat(e.target.value))}
          >
            <option value={0.5}>0.5</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>
        <div>
          <label>시뮬 경로 수</label>
          <select
            value={params.nPaths}
            onChange={(e) => set("nPaths", parseInt(e.target.value))}
          >
            <option value={5000}>5,000 (빠름)</option>
            <option value={15000}>15,000 (기본)</option>
            <option value={30000}>30,000 (정밀)</option>
          </select>
        </div>
      </div>

      <button className="run" onClick={onRun} disabled={running}>
        {running ? "시뮬레이션 실행 중…" : "▶ 프래질리티 평가 실행"}
      </button>
    </div>
  );
}
