import { TradingError } from "../../../../lib/binance-web3";
const failure = (error: unknown) =>
  Response.json(
    {
      error:
        error instanceof Error ? error.message : "Mainnet service unavailable.",
    },
    {
      status: error instanceof TradingError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
import { listMainnetAssets } from "../../../../lib/trading-server";
import { binanceConfigured } from "../../../../lib/binance-web3";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(
      { assets: await listMainnetAssets(), configured: binanceConfigured() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
