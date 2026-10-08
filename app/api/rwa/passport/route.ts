import { NextResponse } from "next/server";
import { rwaCompany, rwaConfigured } from "../../../../lib/rwa-server";
export const runtime = "nodejs";
const cache = new Map<string, { at: number; body: unknown }>();
/** Company profile + BSC contracts + live spread for one ticker. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const contract = searchParams.get("contract");
  if (contract && !/^0x[0-9a-fA-F]{40}$/.test(contract))
    return NextResponse.json({ available: false }, { status: 400 });
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker))
    return NextResponse.json({ available: false }, { status: 400 });
  if (!rwaConfigured()) return NextResponse.json({ available: false });
  const cacheKey = `${ticker}:${contract?.toLowerCase() ?? "primary"}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 300000) return NextResponse.json(hit.body);
  try {
    const company = await rwaCompany(ticker, contract);
    if (!company) return NextResponse.json({ available: false, ticker });
    const body = {
      available: true,
      fetchedAt: new Date().toISOString(),
      ...company,
    };
    cache.set(cacheKey, { at: Date.now(), body });
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return NextResponse.json({
      available: false,
      ticker,
      error: error instanceof Error ? error.message : "RWA unavailable",
    });
  }
}
