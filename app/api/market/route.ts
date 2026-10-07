import { NextResponse } from "next/server";
import {
  unavailableFeed,
  type MarketFeed,
  type Quote,
} from "../../../lib/market";
import { listMainnetAssets } from "../../../lib/trading-server";
import { rwaSession } from "../../../lib/rwa-server";
import type { MainnetAsset } from "../../../lib/mainnet";

export const runtime = "nodejs";
const rank = (asset: MainnetAsset) =>
  asset.platform === "ondo" ? 0 : asset.platform === "bstock" ? 1 : 2;

export async function GET() {
  const feed: MarketFeed = unavailableFeed();
  try {
    const tokens = (await listMainnetAssets())
      .slice()
      .sort((a, b) => rank(a) - rank(b) || a.address.localeCompare(b.address));
    const selected = new Set<string>();
    for (const asset of tokens) {
      // One canonical issuer per ticker in the legacy research view. A market
      // observation never becomes an executable trade quote.
      if (asset.chainId !== 56 || selected.has(asset.ticker)) continue;
      selected.add(asset.ticker);
      const price = Number(asset.priceUsd);
      if (!Number.isFinite(price) || price <= 0) continue;
      const observedAt = asset.priceUpdatedAt;
      const age = observedAt ? Date.now() - Date.parse(observedAt) : Infinity;
      const quote: Quote = {
        ticker: asset.ticker,
        price,
        change: 0,
        changeAvailable: false,
        source: `Binance Web3 · BSC ${asset.platform} token observation`,
        status: age >= 0 && age < 120_000 ? "live" : "stale",
        fetchedAt: observedAt,
        tokenName: asset.symbol,
        contract: asset.address,
        chainId: 56,
        platform: asset.platform,
      };
      const reference = Number(asset.referencePriceUsd);
      if (Number.isFinite(reference) && reference > 0) {
        quote.rwa = {
          onchain: price,
          reference,
          spreadBps: ((price - reference) / reference) * 10_000,
          onchainAt: observedAt,
          session: asset.tradingOpen
            ? "open"
            : asset.marketStatus
              ? "closed"
              : "unknown",
          referenceFrozen: !asset.tradingOpen,
          platform: asset.platform,
          contract: asset.address,
        };
      }
      feed.quotes[asset.ticker] = quote;
    }
    feed.marketSession = await rwaSession([...selected]);
    if (!Object.values(feed.quotes).some((quote) => quote.price > 0))
      feed.error =
        "BSC token prices are unavailable. No reference or assumed price is substituted.";
  } catch {
    feed.error =
      "BSC token prices are unavailable. Check the Binance Web3 configuration and retry.";
  }
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}
