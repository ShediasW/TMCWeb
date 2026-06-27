"use client";

import { ForecastOutput } from "@/lib/sim/forecast";

// Numeric insight panel: percentile table, expected value, target probability,
// tail risk (VaR / expected shortfall) and drawdown.
export default function PriceInsights({
  r,
  currency,
}: {
  r: ForecastOutput;
  currency: string;
}) {
  const px = (v: number) => `${v.toFixed(2)} ${currency}`;
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const prob = (v: number) => `${(v * 100).toFixed(1)}%`;

  const months = Math.round(r.tYears * 12);

  return (
    <div className="panel">
      <p className="chart-title">
        {months}개월 후 가격 분포 — {r.nPaths.toLocaleString()}회 시뮬레이션 (현재가 {px(r.s0)})
      </p>

      <table className="cmp">
        <thead>
          <tr>
            <th>분위수</th>
            <th>가격</th>
            <th>수익률</th>
            <th>해석</th>
          </tr>
        </thead>
        <tbody>
          {r.percentiles.map((p) => (
            <tr key={p.p}>
              <td>P{p.p}</td>
              <td>{px(p.price)}</td>
              <td style={{ color: p.retPct >= 0 ? "var(--anti)" : "var(--fragile)" }}>
                {pct(p.retPct)}
              </td>
              <td style={{ color: "var(--muted)" }}>
                {p.p === 50
                  ? "중앙값"
                  : p.p < 50
                  ? `하위 ${p.p}% 시나리오`
                  : `상위 ${100 - p.p}% 시나리오`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="metrics" style={{ marginTop: 12 }}>
        <div className="metric">
          <div className="k">기대 가격 (평균)</div>
          <div className="v">{px(r.meanPrice)}</div>
        </div>
        <div className="metric">
          <div className="k">기대 수익률</div>
          <div className="v" style={{ color: r.expectedReturnPct >= 0 ? "var(--anti)" : "var(--fragile)" }}>
            {pct(r.expectedReturnPct)}
          </div>
        </div>
        <div className="metric">
          <div className="k">VaR 95% (5% 최악 경계)</div>
          <div className="v" style={{ color: "var(--fragile)" }}>{pct(r.var5Pct)}</div>
        </div>
        <div className="metric">
          <div className="k">기대손실 CVaR 95%</div>
          <div className="v" style={{ color: "var(--fragile)" }}>{pct(r.cvar5Pct)}</div>
        </div>
        <div className="metric">
          <div className="k">전형적 최대낙폭 (중앙값)</div>
          <div className="v">-{r.medianMaxDrawdownPct.toFixed(1)}%</div>
        </div>
        <div className="metric">
          <div className="k">악조건 최대낙폭 (P95)</div>
          <div className="v" style={{ color: "var(--fragile)" }}>-{r.p95MaxDrawdownPct.toFixed(1)}%</div>
        </div>
      </div>

      {r.targetPrice && r.probAboveTarget !== undefined && (
        <div className="good" style={{ marginTop: 12 }}>
          목표가 <b>{px(r.targetPrice)}</b> 기준 — 도달(이상) 확률{" "}
          <b>{prob(r.probAboveTarget)}</b> · 미달 확률{" "}
          <b>{prob(r.probBelowTarget ?? 0)}</b>
        </div>
      )}

      <div className="warn" style={{ marginTop: 12 }}>
        <b>하락 확률 (멱법칙 꼬리 반영):</b>
        <div style={{ marginTop: 4 }}>
          {r.lossProbs.map((l) => (
            <span key={l.dropPct} style={{ marginRight: 14, display: "inline-block" }}>
              −{l.dropPct}% 이상 하락: <b>{prob(l.prob)}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
