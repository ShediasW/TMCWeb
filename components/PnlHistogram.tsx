"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Histogram of terminal P&L (% of capital). Highlights the fat tails: a fragile
// strategy shows a long, heavy left tail; an antifragile one a long right tail.
export default function PnlHistogram({ sample }: { sample: number[] }) {
  const bins = useMemo(() => {
    if (sample.length === 0) return [];
    let lo = Math.min(...sample);
    let hi = Math.max(...sample);
    // clamp extreme outliers for readability but keep tail visible
    lo = Math.max(lo, -120);
    hi = Math.min(hi, 300);
    if (hi - lo < 1) hi = lo + 1;
    const nBins = 28;
    const width = (hi - lo) / nBins;
    const counts = new Array(nBins).fill(0);
    for (const v of sample) {
      let idx = Math.floor((v - lo) / width);
      if (idx < 0) idx = 0;
      if (idx >= nBins) idx = nBins - 1;
      counts[idx]++;
    }
    return counts.map((c, i) => ({
      mid: lo + width * (i + 0.5),
      count: c,
    }));
  }, [sample]);

  return (
    <div className="panel">
      <p className="chart-title">손익 분포 (% 자본) — 팻테일의 모양. 빨강=손실 구간, 초록=이익 구간.</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={bins} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
          <XAxis
            dataKey="mid"
            tick={{ fill: "#8b98a5", fontSize: 11 }}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
          />
          <YAxis tick={{ fill: "#8b98a5", fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: "#1a232e", border: "1px solid #243140", borderRadius: 8 }}
            labelFormatter={(v) => `${Number(v).toFixed(1)}%`}
            formatter={(v: number) => [v, "경로 수"]}
          />
          <ReferenceLine x={0} stroke="#8b98a5" strokeDasharray="4 4" />
          <Bar dataKey="count">
            {bins.map((b, i) => (
              <Cell key={i} fill={b.mid < 0 ? "#ff5252" : "#2ecc71"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
