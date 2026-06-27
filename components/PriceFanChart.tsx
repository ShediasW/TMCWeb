"use client";

import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FanPoint } from "@/lib/sim/forecast";

// Percentile fan over time: the P5–P95 and P25–P75 bands widen with the
// horizon, and the fat tails make the outer band flare more than a Gaussian
// model would. Built from a capped subsample of recorded trajectories.
export default function PriceFanChart({
  fan,
  tYears,
  currency,
}: {
  fan: FanPoint[];
  tYears: number;
  currency: string;
}) {
  if (fan.length === 0) return null;

  // Stack areas: lower offsets + band heights so recharts renders ribbons.
  const data = fan.map((f) => ({
    t: (f.t * tYears * 12).toFixed(1), // months elapsed
    base5: f.p5,
    band5_95: f.p95 - f.p5,
    base25: f.p25,
    band25_75: f.p75 - f.p25,
    p50: f.p50,
  }));

  return (
    <div className="panel">
      <p className="chart-title">
        시간대별 가격 팬차트 ({currency}) — 가운데 선=중앙값, 음영=P25–75 / P5–95 구간
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -6 }}>
          <XAxis
            dataKey="t"
            tick={{ fill: "#8b98a5", fontSize: 11 }}
            tickFormatter={(v) => `${v}개월`}
          />
          <YAxis
            tick={{ fill: "#8b98a5", fontSize: 11 }}
            domain={["auto", "auto"]}
            tickFormatter={(v) => Number(v).toFixed(0)}
          />
          <Tooltip
            contentStyle={{ background: "#1a232e", border: "1px solid #243140", borderRadius: 8 }}
            labelFormatter={(v) => `${v}개월 후`}
            formatter={(val: number, name: string) => {
              if (name === "p50") return [`${val.toFixed(2)} ${currency}`, "중앙값"];
              return [null, null] as unknown as [string, string];
            }}
          />
          {/* P5..P95 outer band */}
          <Area dataKey="base5" stackId="outer" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area
            dataKey="band5_95"
            stackId="outer"
            stroke="none"
            fill="#4ea1ff"
            fillOpacity={0.12}
            isAnimationActive={false}
          />
          {/* P25..P75 inner band */}
          <Area dataKey="base25" stackId="inner" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area
            dataKey="band25_75"
            stackId="inner"
            stroke="none"
            fill="#4ea1ff"
            fillOpacity={0.25}
            isAnimationActive={false}
          />
          <Line
            dataKey="p50"
            stroke="#4ea1ff"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
