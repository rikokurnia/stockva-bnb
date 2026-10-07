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
import { readWalletBalances } from "../../../../lib/trading-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await readWalletBalances(
        new URL(request.url).searchParams.get("account"),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
