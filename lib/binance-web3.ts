// Server-only: this module is imported by API routes and server data modules.
import { createHmac, randomUUID } from "node:crypto";

export class TradingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "TradingError";
    this.status = status;
  }
}
export function binanceConfigured() {
  return Boolean(
    process.env.BINANCE_WEB3_API_KEY && process.env.BINANCE_WEB3_API_SECRET,
  );
}
export function signBinanceRequest(
  secret: string,
  timestamp: string,
  method: string,
  signedPath: string,
  body = "",
) {
  return createHmac("sha256", secret)
    .update(timestamp + method + signedPath + body)
    .digest("base64");
}
export async function binanceRequest<T>(
  path: string,
  params: Record<string, string> = {},
  payload?: Record<string, unknown> | Record<string, unknown>[],
): Promise<T> {
  if (typeof window !== "undefined")
    throw new Error("Binance credentials must remain on the server.");
  if (!binanceConfigured())
    throw new TradingError(
      "Mainnet trading is unavailable: Binance Web3 server credentials are missing.",
      503,
    );
  // Call sites choose from a fixed set of reviewed endpoints, never a client-supplied URL.
  if (!/^\/api\/v1\/dex\//.test(path))
    throw new TradingError("Unsupported Binance endpoint.");
  const query = new URLSearchParams(params).toString();
  const signedPath = `/build${path}${query ? `?${query}` : ""}`;
  const body = payload ? JSON.stringify(payload) : "";
  const method = payload ? "POST" : "GET";
  const timestamp = new Date().toISOString();
  let response: Response;
  try {
    response = await fetch(`https://web3.binance.com${signedPath}`, {
      method,
      headers: {
        "X-OC-APIKEY": process.env.BINANCE_WEB3_API_KEY!,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signBinanceRequest(
          process.env.BINANCE_WEB3_API_SECRET!,
          timestamp,
          method,
          signedPath,
          body,
        ),
        "X-OC-NONCE": randomUUID(),
        "X-OC-RECV-WINDOW": "15000",
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new TradingError(
      "Binance trading service could not be reached. Check any pending order before retrying.",
      502,
    );
  }
  if (!response.ok)
    throw new TradingError(
      `Binance trading service returned HTTP ${response.status}.`,
      502,
    );
  const result = (await response.json()) as {
    code?: number;
    msg?: string;
    data?: T;
  };
  if (result.code !== 0)
    throw new TradingError(
      `Binance ${result.code ?? "error"}: ${String(result.msg ?? "route unavailable").slice(0, 240)}`,
      result.code === 40401 ? 409 : 422,
    );
  return result.data as T;
}
