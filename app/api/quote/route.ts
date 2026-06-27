// Quote + history proxy backed by Twelve Data. Returns the latest price and a
// clean daily close series (oldest -> newest) that lib/calibrate.ts turns into
// drift, volatility and a power-law tail exponent.
//
// Requires TWELVE_DATA_API_KEY (free tier works). Without it we return a
// distinct { error: "no_api_key" } so the client can fall back to manual entry
// instead of showing a hard failure.

import { NextRequest, NextResponse } from "next/server";

export const revalidate = 1800; // cache history for 30 minutes

const ALLOWED_RANGES: Record<string, number> = {
  "6mo": 130,
  "1y": 260,
  "2y": 520,
  "5y": 1300,
};

export interface QuoteResponse {
  symbol: string;
  currency: string;
  price: number;
  closes: number[];
  timestamps: number[];
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  const range = req.nextUrl.searchParams.get("range")?.trim() || "2y";
  const outputsize = ALLOWED_RANGES[range] ?? ALLOWED_RANGES["2y"];
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    // Surface a soft, recognizable signal so the UI offers manual entry.
    return NextResponse.json({ error: "no_api_key" }, { status: 200 });
  }

  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1day&outputsize=${outputsize}&apikey=${key}`;

  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate },
    });
    if (!r.ok) {
      return NextResponse.json({ error: `upstream ${r.status}` }, { status: 502 });
    }
    const json = await r.json();
    if (json?.status === "error") {
      const isLimit = json.code === 429;
      return NextResponse.json(
        { error: isLimit ? "rate_limited" : json.message || "provider error" },
        { status: isLimit ? 429 : 502 },
      );
    }
    const meta = json?.meta ?? {};
    const values: { datetime: string; close: string }[] = json?.values ?? [];
    if (values.length < 30) {
      return NextResponse.json({ error: "insufficient history" }, { status: 404 });
    }
    // Twelve Data returns newest-first; reverse to oldest-first for calibration.
    const closes: number[] = [];
    const timestamps: number[] = [];
    for (let i = values.length - 1; i >= 0; i--) {
      const c = parseFloat(values[i].close);
      if (Number.isFinite(c) && c > 0) {
        closes.push(c);
        timestamps.push(Math.floor(new Date(values[i].datetime).getTime() / 1000));
      }
    }
    const payload: QuoteResponse = {
      symbol: meta.symbol || symbol.toUpperCase(),
      currency: meta.currency || "USD",
      price: closes[closes.length - 1],
      closes,
      timestamps,
    };
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "quote failed" }, { status: 502 });
  }
}
