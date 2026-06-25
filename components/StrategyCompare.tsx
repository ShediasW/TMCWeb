"use client";

import { useState } from "react";
import { RunInput, RunOutput } from "@/lib/sim/engine";
import { PRESET_STRATEGIES } from "@/lib/sim/strategies";
import { SimParams } from "./StrategyBuilder";

interface Row {
  name: string;
  verdict: string;
  convexity: number;
  ruin: number;
  worst: number;
}

const VERDICT_KO: Record<string, string> = {
  ANTIFRAGILE: "안티프래질",
  ROBUST: "로버스트",
  FRAGILE: "프래질",
};

export default function StrategyCompare({
  params,
  run,
}: {
  params: SimParams;
  run: (input: RunInput) => Promise<RunOutput>;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function compareAll() {
    setBusy(true);
    try {
      const results: Row[] = [];
      for (const strat of PRESET_STRATEGIES) {
        const input: RunInput = {
          strategy: strat,
          s0: 100,
          tYears: params.tYears,
          r: 0.045,
          baseVol: params.baseVol,
          jumpIntensity: params.jumpIntensity,
          swanProb: params.swanProb,
          swanMagnitude: params.swanMagnitude,
          swanDirection: params.swanDirection,
          nPaths: Math.min(params.nPaths, 8000), // cap for speed across 7 runs
          capital: 100000,
        };
        const { fragility } = await run(input);
        results.push({
          name: strat.name,
          verdict: fragility.verdict,
          convexity: fragility.convexityIndex,
          ruin: fragility.ruinProb * 100,
          worst: fragility.worstLossPct,
        });
      }
      // Taleb's decision ordering: survival first (lowest ruin), then convexity.
      results.sort((a, b) => a.ruin - b.ruin || b.convexity - a.convexity);
      setRows(results);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>전략 비교 — 무엇이 블랙스완을 살아남는가</h2>
      <p className="desc" style={{ marginTop: 0 }}>
        현재 무질서 가정으로 모든 프리셋을 평가해, <b>파산확률(생존)을 1순위</b>, 볼록성을
        2순위로 정렬한다. 의사결정 표.
      </p>
      <button className="run" onClick={compareAll} disabled={busy} style={{ marginTop: 4 }}>
        {busy ? "비교 계산 중…" : "▶ 전체 전략 비교"}
      </button>

      {rows && (
        <table className="cmp" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>전략</th>
              <th>판정</th>
              <th>볼록성</th>
              <th>파산%</th>
              <th>최악손실%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>
                  <span className={`pill ${r.verdict}`}>{VERDICT_KO[r.verdict]}</span>
                </td>
                <td>{r.convexity.toFixed(2)}</td>
                <td style={{ color: r.ruin > 0.5 ? "var(--fragile)" : "var(--muted)" }}>
                  {r.ruin.toFixed(1)}
                </td>
                <td>{r.worst.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
