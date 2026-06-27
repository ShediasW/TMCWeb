// Ticker search proxy backed by Twelve Data (https://twelvedata.com).
//
// We moved off Yahoo's unofficial endpoint because it rate-limits (HTTP 429)
// datacenter IPs like Vercel's serverless functions, which left the search box
// empty in production. Twelve Data is reliable from servers; symbol search is
// open, and the API key (when set) is forwarded for higher limits.
//
// Set TWELVE_DATA_API_KEY in the Vercel project env for full coverage.

import { NextRequest, NextResponse } from "next/server";

export const revalidate = 600; // cache identical queries for 10 minutes

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ quotes: [] as SearchHit[] });

  const key = process.env.TWELVE_DATA_API_KEY;
  const url =
    `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(q)}` +
    `&outputsize=12${key ? `&apikey=${key}` : ""}`;

  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate },
    });
    if (!r.ok) {
      return NextResponse.json(
        { quotes: [] as SearchHit[], error: `upstream ${r.status}` },
        { status: 502 },
      );
    }
    const json = await r.json();
    // Twelve Data signals problems with { status: "error", code, message }.
    if (json?.status === "error") {
      return NextResponse.json(
        { quotes: [] as SearchHit[], error: json.message || "provider error" },
        { status: 502 },
      );
    }
    const seen = new Set<string>();
    const quotes: SearchHit[] = (json?.data ?? [])
      .map(
        (x: {
          symbol: string;
          instrument_name?: string;
          exchange?: string;
          instrument_type?: string;
        }) => ({
          symbol: x.symbol,
          name: x.instrument_name || x.symbol,
          exchange: x.exchange || "",
          type: x.instrument_type || "",
        }),
      )
      .filter((h: SearchHit) => {
        // de-dupe identical symbol+exchange rows Twelve Data returns
        const k = `${h.symbol}|${h.exchange}`;
        if (!h.symbol || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 10);
    return NextResponse.json({ quotes });
  } catch {
    return NextResponse.json(
      { quotes: [] as SearchHit[], error: "search failed" },
      { status: 502 },
    );
  }
}
