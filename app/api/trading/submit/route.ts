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
  submitTrade,
  tradingBody,
  tradingSession,
} from "../../../../lib/trading-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await tradingBody(request, ["quoteId", "userSignature"]);
    return Response.json(
      await submitTrade(
        body.quoteId,
        body.userSignature,
        tradingSession(request),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
