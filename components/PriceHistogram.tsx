"use client";

import {
  Bar,
  BarChart,
  Cell,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HistBin } from "@/lib/sim/forecast";

// Terminal-return distribution. Bars are the fat-tailed model; the overlaid
// line is a matched-(mu, sigma) Gaussian GBM. The point Taleb keeps making is
// visible here: the Gaussian curve assigns almost no mass to the deep-loss and
// big-gain bins that the power-law model populates.
export default function PriceHistogram({
  bins,
  compareGaussian,
}: {
  bins: HistBin[];
  compareGaussian: boolean;
}) {
  const Chart = compareGaussian ? ComposedChart : BarChart;
  return (
    <div className="panel">
      <p className="chart-title">
        만기 수익률 분포 — 막대=멱법칙(팻테일) 모델
        {compareGaussian ? ", 선=정규분포(가우시안) 베이스라인" : ""}. 빨강=손실, 초록=이익.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <Chart data={bins} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
          <XAxis
            dataKey="mid"
            tick={{ fill: "#8b98a5", fontSize: 11 }}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
          />
          <YAxis tick={{ fill: "#8b98a5", fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: "#1a232e", border: "1px solid #243140", borderRadius: 8 }}
            labelFormatter={(v) => `${Number(v).toFixed(1)}%`}
            formatter={(val: number, name: string) => [
              val,
              name === "gaussCount" ? "정규분포" : "팻테일 경로 수",
            ]}
          />
          <ReferenceLine x={0} stroke="#8b98a5" strokeDasharray="4 4" />
          <Bar dataKey="count">
            {bins.map((b, i) => (
              <Cell key={i} fill={b.mid < 0 ? "#ff5252" : "#2ecc71"} />
            ))}
          </Bar>
          {compareGaussian && (
            <Line
              dataKey="gaussCount"
              stroke="#f1c40f"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
