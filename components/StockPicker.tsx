"use client";

import { useEffect, useRef, useState } from "react";
import { calibrate, manualCalibration, Calibration } from "@/lib/calibrate";
import type { SearchHit } from "@/app/api/search/route";

export interface StockData {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  calibration: Calibration;
  manual?: boolean;
}

// Search a ticker and auto-calibrate from history; fall back to manual entry
// when no data provider key is configured or the provider is unreachable.
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
  const [manual, setManual] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = q.trim();
    if (manual || term.length < 1) {
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
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, manual]);

  async function pick(hit: SearchHit) {
    setOpen(false);
    setQ(`${hit.symbol} — ${hit.name}`);
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/quote?symbol=${encodeURIComponent(hit.symbol)}&range=2y`);
      const data = await r.json();
      if (data.error === "no_api_key") {
        setManual(true);
        setManualForm((f) => ({ ...f, symbol: hit.symbol, name: hit.name }));
        setError("데이터 제공자 키가 설정되지 않아 수동 입력으로 전환합니다.");
        return;
      }
      if (!r.ok || data.error) {
        throw new Error(
          data.error === "rate_limited" ? "요청이 많아 잠시 후 다시 시도하세요" : data.error || `오류 ${r.status}`,
        );
      }
      onSelect({
        symbol: data.symbol,
        name: hit.name,
        currency: data.currency,
        price: data.price,
        calibration: calibrate(data.closes),
      });
    } catch (e) {
      setError(`데이터를 불러오지 못했습니다: ${(e as Error).message}. 아래에서 직접 입력할 수 있습니다.`);
      setManual(true);
      setManualForm((f) => ({ ...f, symbol: hit.symbol, name: hit.name }));
    } finally {
      setLoading(false);
    }
  }

  // ----- manual entry -----
  const [manualForm, setManualForm] = useState({
    symbol: "",
    name: "",
    currency: "USD",
    price: "" as number | "",
    annualVolPct: 25 as number | "",
    annualDriftPct: 8 as number | "",
    tailAlpha: 3 as number | "",
  });

  function submitManual() {
    const price = Number(manualForm.price);
    const vol = Number(manualForm.annualVolPct);
    if (!price || price <= 0 || !vol || vol <= 0) {
      setError("현재가와 연 변동성을 양수로 입력하세요.");
      return;
    }
    setError(null);
    onSelect({
      symbol: manualForm.symbol.trim().toUpperCase() || "MANUAL",
      name: manualForm.name.trim() || "직접 입력",
      currency: manualForm.currency.trim() || "USD",
      price,
      manual: true,
      calibration: manualCalibration({
        price,
        annualVol: vol / 100,
        annualDrift: manualForm.annualDriftPct === "" ? undefined : Number(manualForm.annualDriftPct) / 100,
        tailAlpha: manualForm.tailAlpha === "" ? undefined : Number(manualForm.tailAlpha),
      }),
    });
  }

  const setM = <K extends keyof typeof manualForm>(k: K, v: (typeof manualForm)[K]) =>
    setManualForm((f) => ({ ...f, [k]: v }));

  const cur = (v: number) =>
    selected ? `${v.toFixed(2)} ${selected.currency}` : v.toFixed(2);

  const inputStyle = {
    width: "100%",
    background: "var(--panel-2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: 9,
    padding: 10,
    fontSize: "0.95rem",
  } as const;

  return (
    <div className="panel">
      <div className="row">
        <h2 style={{ margin: 0 }}>① 종목 선택</h2>
        <button
          onClick={() => {
            setManual((m) => !m);
            setError(null);
          }}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--accent)",
            borderRadius: 8,
            padding: "5px 10px",
            fontSize: "0.75rem",
            cursor: "pointer",
          }}
        >
          {manual ? "🔍 검색으로" : "✏️ 직접 입력"}
        </button>
      </div>

      {!manual && (
        <>
          <label>종목명 또는 티커 검색</label>
          <input
            type="text"
            inputMode="search"
            placeholder="예: apple, AAPL, Microsoft"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => hits.length && setOpen(true)}
            style={inputStyle}
          />

          {open && hits.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 9, marginTop: 6, overflow: "hidden" }}>
              {hits.map((h) => (
                <button
                  key={`${h.symbol}|${h.exchange}`}
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
                  {h.exchange && <span style={{ color: "var(--muted)" }}> · {h.exchange}</span>}
                </button>
              ))}
            </div>
          )}

          {searching && <p className="desc">검색 중…</p>}
          {loading && <p className="desc">시세·과거 데이터 불러오는 중…</p>}
        </>
      )}

      {manual && (
        <>
          <p className="desc" style={{ marginTop: 4 }}>
            티커·현재가·연 변동성을 입력하면 보정됩니다. 변동성은 멱법칙(팻테일) 시뮬의 기준값입니다.
          </p>
          <div className="grid2" style={{ marginTop: 6 }}>
            <div>
              <label>티커/이름</label>
              <input style={inputStyle} value={manualForm.symbol}
                onChange={(e) => setM("symbol", e.target.value)} placeholder="AAPL" />
            </div>
            <div>
              <label>통화</label>
              <input style={inputStyle} value={manualForm.currency}
                onChange={(e) => setM("currency", e.target.value)} placeholder="USD" />
            </div>
          </div>
          <div className="grid2" style={{ marginTop: 6 }}>
            <div>
              <label>현재가 *</label>
              <input style={inputStyle} type="number" inputMode="decimal" value={manualForm.price}
                onChange={(e) => setM("price", e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder="283.78" />
            </div>
            <div>
              <label>연 변동성 % *</label>
              <input style={inputStyle} type="number" inputMode="decimal" value={manualForm.annualVolPct}
                onChange={(e) => setM("annualVolPct", e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder="25" />
            </div>
          </div>
          <div className="grid2" style={{ marginTop: 6 }}>
            <div>
              <label>연 드리프트 % (선택)</label>
              <input style={inputStyle} type="number" inputMode="decimal" value={manualForm.annualDriftPct}
                onChange={(e) => setM("annualDriftPct", e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder="8" />
            </div>
            <div>
              <label>꼬리지수 α (선택)</label>
              <input style={inputStyle} type="number" inputMode="decimal" value={manualForm.tailAlpha}
                onChange={(e) => setM("tailAlpha", e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder="3" />
            </div>
          </div>
          <button className="run" onClick={submitManual} style={{ marginTop: 12 }}>
            ✓ 이 값으로 보정
          </button>
        </>
      )}

      {error && <div className="warn" style={{ marginTop: 10 }}>{error}</div>}

      {selected && !loading && (
        <>
          <div className="metrics" style={{ marginTop: 12 }}>
            <div className="metric">
              <div className="k">{selected.symbol} {selected.manual ? "(수동)" : "현재가"}</div>
              <div className="v">{cur(selected.price)}</div>
            </div>
            <div className="metric">
              <div className="k">연 변동성</div>
              <div className="v">{(selected.calibration.annualVol * 100).toFixed(1)}%</div>
            </div>
            <div className="metric">
              <div className="k">연 드리프트</div>
              <div className="v">{(selected.calibration.annualDrift * 100).toFixed(1)}%</div>
            </div>
            <div className="metric">
              <div className="k">꼬리지수 α</div>
              <div className="v">{selected.calibration.tailAlpha.toFixed(2)}</div>
            </div>
          </div>
          <p className="desc">
            {selected.manual
              ? "직접 입력값 기반. 꼬리지수 α가 작을수록(≈3 전형값) 극단 점프가 더 빈번 — 멱법칙(팻테일) 강도입니다."
              : `과거 ${selected.calibration.nReturns}일 수익률로 자동 보정. 꼬리지수 α가 작을수록(≈3 전형값) 극단 점프가 더 빈번 — 멱법칙(팻테일) 강도입니다.`}
          </p>
        </>
      )}
    </div>
  );
}
