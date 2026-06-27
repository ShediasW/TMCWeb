"use client";

// Controls for the price-probability forecast: trials, horizon, target price,
// and the exposed fat-tail / black-swan knobs (pre-filled from calibration).

export interface ForecastParams {
  nPaths: number;
  horizonDays: number; // trading days
  targetPrice: number | ""; // optional probability target
  annualDrift: number;
  baseVol: number;
  tailAlpha: number;
  jumpIntensity: number;
  swanProb: number;
  swanMagnitude: number;
  swanDirection: number;
  compareGaussian: boolean;
}

const HORIZONS = [
  { d: 21, label: "1개월" },
  { d: 63, label: "3개월" },
  { d: 126, label: "6개월" },
  { d: 252, label: "1년" },
];

export default function ForecastControls({
  params,
  setParams,
  onRun,
  running,
  disabled,
  currency,
}: {
  params: ForecastParams;
  setParams: (p: ForecastParams) => void;
  onRun: () => void;
  running: boolean;
  disabled: boolean;
  currency: string;
}) {
  const set = <K extends keyof ForecastParams>(k: K, v: ForecastParams[K]) =>
    setParams({ ...params, [k]: v });

  return (
    <div className="panel">
      <h2>② 시뮬레이션 설정</h2>

      <label>예측 기간</label>
      <div className="tabs" style={{ marginBottom: 8 }}>
        {HORIZONS.map((h) => (
          <button
            key={h.d}
            className={params.horizonDays === h.d ? "active" : ""}
            onClick={() => set("horizonDays", h.d)}
          >
            {h.label}
          </button>
        ))}
      </div>

      <div className="grid2">
        <div>
          <label>시행 횟수 (경로 수)</label>
          <select
            value={params.nPaths}
            onChange={(e) => set("nPaths", parseInt(e.target.value))}
          >
            <option value={5000}>5,000 (빠름)</option>
            <option value={20000}>20,000 (기본)</option>
            <option value={50000}>50,000 (정밀)</option>
            <option value={100000}>100,000 (최대)</option>
          </select>
        </div>
        <div>
          <label>목표가 ({currency}) — 선택</label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="예: 도달 확률을 볼 가격"
            value={params.targetPrice}
            onChange={(e) =>
              set("targetPrice", e.target.value === "" ? "" : parseFloat(e.target.value))
            }
          />
        </div>
      </div>

      <h2 style={{ marginTop: 16 }}>③ 팻테일 / 블랙스완 가정</h2>
      <p className="desc" style={{ marginTop: 0 }}>
        과거 데이터로 자동 보정됨. 직접 조절해 시나리오를 강화·완화할 수 있습니다.
      </p>

      <div className="grid2" style={{ marginTop: 6 }}>
        <div>
          <div className="row">
            <label style={{ margin: 0 }}>꼬리지수 α</label>
            <span className="val">{params.tailAlpha.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={1.5}
            max={6}
            step={0.1}
            value={params.tailAlpha}
            onChange={(e) => set("tailAlpha", parseFloat(e.target.value))}
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

      <div className="grid2" style={{ marginTop: 6 }}>
        <div>
          <div className="row">
            <label style={{ margin: 0 }}>연 변동성</label>
            <span className="val">{(params.baseVol * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0.05}
            max={0.8}
            step={0.01}
            value={params.baseVol}
            onChange={(e) => set("baseVol", parseFloat(e.target.value))}
          />
        </div>
        <div>
          <div className="row">
            <label style={{ margin: 0 }}>연 드리프트</label>
            <span className="val">{(params.annualDrift * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={-0.3}
            max={0.4}
            step={0.01}
            value={params.annualDrift}
            onChange={(e) => set("annualDrift", parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <label style={{ margin: 0 }}>블랙스완 발생 확률 (기간 내)</label>
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

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <input
          type="checkbox"
          checked={params.compareGaussian}
          onChange={(e) => set("compareGaussian", e.target.checked)}
          style={{ width: "auto" }}
        />
        정규분포(가우시안) 베이스라인과 비교
      </label>

      <button className="run" onClick={onRun} disabled={running || disabled}>
        {running ? "몬테카를로 실행 중…" : disabled ? "먼저 종목을 선택하세요" : "▶ 가격 확률 시뮬레이션"}
      </button>
    </div>
  );
}
