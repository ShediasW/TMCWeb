"use client";

import { useEffect, useRef, useState } from "react";
import { calibrate, Calibration } from "@/lib/calibrate";
import type { SearchHit } from "@/app/api/search/route";

export interface StockData {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  calibration: Calibration;
}

// Search a ticker, fetch its history, and auto-calibrate the simulation.
export default function StockPicker({
  selected,
  onSelect,
}: {
  selected: StockData | null;
  onSelect: (s: StockData) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (term.length < 1) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await r.json();
        setHits(data.quotes ?? []);
        setOpen(true);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  async function pick(hit: SearchHit) {
    setOpen(false);
    setQ(`${hit.symbol} — ${hit.name}`);
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/quote?symbol=${encodeURIComponent(hit.symbol)}&range=2y`);
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `오류 ${r.status}`);
      }
      const data = await r.json();
      const cal = calibrate(data.closes);
      onSelect({
        symbol: data.symbol,
        name: hit.name,
        currency: data.currency,
        price: data.price,
        calibration: cal,
      });
    } catch (e) {
      setError(`데이터를 불러오지 못했습니다: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  const cur = (v: number) =>
    selected ? `${v.toFixed(2)} ${selected.currency}` : v.toFixed(2);

  return (
    <div className="panel">
      <h2>① 종목 선택</h2>
      <label>종목명 또는 티커 검색</label>
      <input
        type="text"
        inputMode="search"
        placeholder="예: apple, AAPL, 삼성전자, 005930.KS"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        style={{
          width: "100%",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          borderRadius: 9,
          padding: 10,
          fontSize: "0.95rem",
        }}
      />

      {open && hits.length > 0 && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 9,
            marginTop: 6,
            overflow: "hidden",
          }}
        >
          {hits.map((h) => (
            <button
              key={h.symbol}
              onClick={() => pick(h)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "var(--panel-2)",
                border: "none",
                borderBottom: "1px solid var(--border)",
                color: "var(--text)",
                padding: "10px 12px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              <b>{h.symbol}</b> · {h.name}
              <span style={{ color: "var(--muted)" }}> · {h.exchange}</span>
            </button>
          ))}
        </div>
      )}

      {searching && <p className="desc">검색 중…</p>}
      {loading && <p className="desc">시세·과거 데이터 불러오는 중…</p>}
      {error && <div className="warn">{error}</div>}

      {selected && !loading && (
        <>
          <div className="metrics" style={{ marginTop: 12 }}>
            <div className="metric">
              <div className="k">{selected.symbol} 현재가</div>
              <div className="v">{cur(selected.price)}</div>
            </div>
            <div className="metric">
              <div className="k">연 변동성 (과거)</div>
              <div className="v">{(selected.calibration.annualVol * 100).toFixed(1)}%</div>
            </div>
            <div className="metric">
              <div className="k">연 드리프트 (과거)</div>
              <div className="v">{(selected.calibration.annualDrift * 100).toFixed(1)}%</div>
            </div>
            <div className="metric">
              <div className="k">꼬리지수 α (Hill)</div>
              <div className="v">{selected.calibration.tailAlpha.toFixed(2)}</div>
            </div>
          </div>
          <p className="desc">
            과거 {selected.calibration.nReturns}일 수익률로 자동 보정. 꼬리지수 α가 작을수록
            (≈3이 주식 전형값) 극단적 점프가 더 빈번 — 멱법칙(팻테일) 가정의 강도입니다.
          </p>
        </>
      )}
    </div>
  );
}
