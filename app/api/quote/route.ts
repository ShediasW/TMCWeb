// Quote + history proxy. Returns the current price and a clean daily close
// series for a symbol from the Yahoo Finance chart endpoint (no API key).
// The close series is what lib/calibrate.ts turns into drift, volatility and a
// power-law tail exponent. Proxied server-side for the same UA/CORS reasons as
// the search route.

import { NextRequest, NextResponse } from "next/server";

export const revalidate = 1800; // cache history for 30 minutes

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const ALLOWED_RANGES = new Set(["6mo", "1y", "2y", "5y", "10y", "max"]);

export interface QuoteResponse {
  symbol: string;
  currency: string;
  price: number;
  closes: number[];
  timestamps: number[];
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  let range = req.nextUrl.searchParams.get("range")?.trim() || "2y";
  if (!ALLOWED_RANGES.has(range)) range = "2y";
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${range}&interval=1d`;

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate },
    });
    if (!r.ok) {
      return NextResponse.json({ error: `upstream ${r.status}` }, { status: 502 });
    }
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: "no data for symbol" }, { status: 404 });
    }
    const meta = result.meta ?? {};
    const ts: number[] = result.timestamp ?? [];
    // Prefer adjusted close (handles splits/dividends), fall back to raw close.
    const adj: (number | null)[] | undefined =
      result.indicators?.adjclose?.[0]?.adjclose;
    const raw: (number | null)[] | undefined =
      result.indicators?.quote?.[0]?.close;
    const series = adj ?? raw ?? [];

    const closes: number[] = [];
    const timestamps: number[] = [];
    for (let i = 0; i < series.length; i++) {
      const c = series[i];
      if (typeof c === "number" && Number.isFinite(c) && c > 0) {
        closes.push(c);
        timestamps.push(ts[i]);
      }
    }
    if (closes.length < 30) {
      return NextResponse.json(
        { error: "insufficient history" },
        { status: 404 },
      );
    }

    const price =
      typeof meta.regularMarketPrice === "number"
        ? meta.regularMarketPrice
        : closes[closes.length - 1];

    const payload: QuoteResponse = {
      symbol: meta.symbol || symbol.toUpperCase(),
      currency: meta.currency || "USD",
      price,
      closes,
      timestamps,
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "quote failed" }, { status: 502 });
  }
}
