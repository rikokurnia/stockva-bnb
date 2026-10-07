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
import {
  buildTrade,
  tradingBody,
  tradingSession,
} from "../../../../lib/trading-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await tradingBody(request, ["quoteId", "recoveryToken"]);
    return Response.json(
      await buildTrade(
        body.quoteId,
        tradingSession(request),
        body.recoveryToken,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
