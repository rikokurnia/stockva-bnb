import type { MainnetAsset } from "./mainnet";
import type { PricePoint } from "./market";
import { sameTicker } from "./stock-universe.ts";

// Each view fits in one documented 100-candle request. Never request 500.
export const HISTORY_PERIODS = {
  "1h": { range: "1d", interval: "2m", bar: "1m" },
  "1d": { range: "5d", interval: "15m", bar: "15m" },
  "1w": { range: "1mo", interval: "60m", bar: "2h" },
} as const;
export type HistoryPeriod = keyof typeof HISTORY_PERIODS;
export const CANDLE_LIMIT = "100";

/** Same issuer order in market research and wallet trading; exact contracts win. */
export function selectMainnetAsset(
  rows: MainnetAsset[],
  ticker: string,
  contract?: string | null,
): MainnetAsset | undefined {
  const rank = (asset: MainnetAsset) =>
    asset.platform === "bstock" ? 0 : asset.platform === "ondo" ? 1 : 2;
  return rows
    .filter(
      (asset) =>
        asset.chainId === 56 &&
        sameTicker(asset.ticker, ticker) &&
        (!contract || asset.address.toLowerCase() === contract.toLowerCase()),
    )
    .sort((a, b) => rank(a) - rank(b) || a.address.localeCompare(b.address))[0];
}

/** Binance's documented [open, high, low, close, volume, timestampMs, count]. */
export function parseBscCandles(rows: unknown, now = Date.now()): PricePoint[] {
  if (!Array.isArray(rows)) return [];
  const points = new Map<number, PricePoint>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [open, high, low, close, volume, timestamp] = row.map(Number);
    if (
      ![open, high, low, close, timestamp].every(Number.isFinite) ||
      Math.min(open, high, low, close) <= 0 ||
      high < Math.max(open, close, low) ||
      low > Math.min(open, close, high) ||
      timestamp < 1e12 ||
      timestamp > now
    )
      continue;
    points.set(timestamp, {
      time: timestamp,
      token: close,
      open,
      high,
      low,
      ...(Number.isFinite(volume) && volume >= 0 ? { volume } : {}),
    });
  }
  return [...points.values()].sort((a, b) => a.time - b.time);
}
