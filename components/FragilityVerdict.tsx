"use client";

import { FragilityResult } from "@/lib/sim/fragility";

function fmtPct(x: number, digits = 1): string {
  if (!isFinite(x)) return "∞";
  return `${x >= 0 ? "" : ""}${x.toFixed(digits)}%`;
}

const VERDICT_KO: Record<string, string> = {
  ANTIFRAGILE: "안티프래질",
  ROBUST: "로버스트",
  FRAGILE: "프래질",
};

export default function FragilityVerdict({ r }: { r: FragilityResult }) {
  const ruinPct = r.ruinProb * 100;
  const hasRuin = r.ruinProb > 0.005;

  return (
    <>
      <div className={`verdict ${r.verdict}`}>
        <div className="label">{VERDICT_KO[r.verdict]}</div>
        <div className="desc" style={{ marginTop: 6 }}>
          무질서(변동성 ±50%)에 대한 손익 곡률 = {r.convexityIndex.toFixed(2)} (% 자본)
          <br />
          {r.verdict === "ANTIFRAGILE" && "변동성이 커질수록 기대손익이 좋아진다 — 볼록."}
          {r.verdict === "ROBUST" && "변동성에 거의 무관 — 평평한 반응."}
          {r.verdict === "FRAGILE" && "변동성이 커질수록 손실이 가속된다 — 오목."}
        </div>
      </div>

      <div className="panel">
        <h2>핵심 지표</h2>
        <div className="metrics">
          <div className="metric">
            <div className="k">볼록성 지수 (안티프래질리티)</div>
            <div className="v">{r.convexityIndex.toFixed(2)}</div>
          </div>
          <div className="metric">
            <div className="k">파산 확률 (자본 50%+ 손실)</div>
            <div className="v" style={{ color: hasRuin ? "var(--fragile)" : "var(--anti)" }}>
              {fmtPct(ruinPct, 2)}
            </div>
          </div>
          <div className="metric">
            <div className="k">최악 경로 손실</div>
            <div className="v">{fmtPct(r.worstLossPct)}</div>
          </div>
          <div className="metric">
            <div className="k">꼬리 비대칭 (상방/하방)</div>
            <div className="v">{isFinite(r.tailAsymmetry) ? r.tailAsymmetry.toFixed(2) : "∞"}</div>
          </div>
        </div>

        {hasRuin ? (
          <div className="warn">
            ⚠️ <b>생존 게이트 경고:</b> 이 전략은 블랙스완 시나리오에서 자본의 절반 이상을 잃을
            확률이 {fmtPct(ruinPct, 2)}다. 탈레브의 원칙상 파산(흡수장벽)은 비가역적이므로,
            기대수익이 아무리 높아도 이 행동은 <b>피해야 할 후보</b>다.
          </div>
        ) : (
          <div className="good">
            ✅ <b>생존:</b> 모든 시나리오에서 파산(자본 50%+ 손실)을 회피했다. 먼저 블랙스완을
            살아남은 뒤, 볼록성으로 상방을 노리는 탈레브식 우선순위에 부합한다.
          </div>
        )}
      </div>
    </>
  );
}
