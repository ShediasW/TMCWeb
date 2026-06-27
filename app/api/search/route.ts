// Ticker search proxy. The Yahoo Finance search endpoint needs a browser-like
// User-Agent and blocks cross-origin browser calls, so we proxy it server-side.
// No API key required. Results are cached briefly to stay under rate limits.

import { NextRequest, NextResponse } from "next/server";

export const revalidate = 600; // cache identical queries for 10 minutes

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ quotes: [] as SearchHit[] });

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    q,
  )}&quotesCount=8&newsCount=0`;

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate },
    });
    if (!r.ok) {
      return NextResponse.json(
        { quotes: [] as SearchHit[], error: `upstream ${r.status}` },
        { status: 502 },
      );
    }
    const data = await r.json();
    const quotes: SearchHit[] = (data.quotes ?? [])
      .filter(
        (x: { symbol?: string; quoteType?: string }) =>
          x.symbol && (x.quoteType === "EQUITY" || x.quoteType === "ETF"),
      )
      .map(
        (x: {
          symbol: string;
          longname?: string;
          shortname?: string;
          exchDisp?: string;
          exchange?: string;
          quoteType: string;
        }) => ({
          symbol: x.symbol,
          name: x.longname || x.shortname || x.symbol,
          exchange: x.exchDisp || x.exchange || "",
          type: x.quoteType,
        }),
      );
    return NextResponse.json({ quotes });
  } catch {
    return NextResponse.json(
      { quotes: [] as SearchHit[], error: "search failed" },
      { status: 502 },
    );
  }
}
