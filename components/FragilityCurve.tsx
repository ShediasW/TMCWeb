"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// The visual proof of the Taleb–Douady heuristic: mean P&L as a function of the
// volatility scale. Curving UP = antifragile (gains from disorder); curving
// DOWN = fragile (harmed by disorder); flat = robust.
export default function FragilityCurve({
  data,
}: {
  data: { volScale: number; meanPnlPct: number }[];
}) {
  return (
    <div className="panel">
      <p className="chart-title">
        무질서 반응 곡선 — 변동성 배율 대비 기대손익. 위로 볼록=안티프래질, 아래로 오목=프래질.
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
          <XAxis
            dataKey="volScale"
            tick={{ fill: "#8b98a5", fontSize: 11 }}
            tickFormatter={(v) => `${v}x`}
          />
          <YAxis tick={{ fill: "#8b98a5", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: "#1a232e", border: "1px solid #243140", borderRadius: 8 }}
            labelFormatter={(v) => `변동성 ${v}x`}
            formatter={(v: number) => [`${v.toFixed(2)}%`, "기대손익"]}
          />
          <ReferenceLine y={0} stroke="#3a4a5c" />
          <Line type="monotone" dataKey="meanPnlPct" stroke="#f1c40f" dot strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
