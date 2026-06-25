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

export default function PayoffChart({
  data,
  s0,
}: {
  data: { price: number; pnlPct: number }[];
  s0: number;
}) {
  return (
    <div className="panel">
      <p className="chart-title">페이오프 곡선 — 만기 주가 대비 전략 손익(% 자본). 곡률이 곧 볼록성.</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
          <XAxis
            dataKey="price"
            tick={{ fill: "#8b98a5", fontSize: 11 }}
            tickFormatter={(v) => v.toFixed(0)}
          />
          <YAxis tick={{ fill: "#8b98a5", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: "#1a232e", border: "1px solid #243140", borderRadius: 8 }}
            labelFormatter={(v) => `주가 ${Number(v).toFixed(1)}`}
            formatter={(v: number) => [`${v.toFixed(1)}%`, "손익"]}
          />
          <ReferenceLine y={0} stroke="#3a4a5c" />
          <ReferenceLine x={s0} stroke="#8b98a5" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="pnlPct" stroke="#4ea1ff" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
