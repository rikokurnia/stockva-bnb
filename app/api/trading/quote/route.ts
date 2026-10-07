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
  createTradeQuote,
  tradingBody,
  tradingCookie,
  tradingSession,
} from "../../../../lib/trading-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await tradingBody(request, [
      "account",
      "assetAddress",
      "side",
      "amount",
    ]);
    const session = tradingSession(request, true);
    return Response.json(await createTradeQuote(body, session), {
      headers: {
        "Set-Cookie": tradingCookie(session, request),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
