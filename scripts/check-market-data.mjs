// Read-only provider check. No wallet signatures, approvals, or trades.
import env from "@next/env";
import { binanceRequest } from "../lib/binance-web3.ts";
import { listMainnetAssets } from "../lib/trading-server.ts";
import {
  parseBscCandles,
  HISTORY_PERIODS,
  CANDLE_LIMIT,
} from "../lib/market-observations.ts";

import { getStockUniverse } from "../lib/stock-universe-server.ts";
import { stockCoverage, priceFreshness } from "../lib/stock-universe.ts";

env.loadEnvConfig(process.cwd());
try {
  const assets = await listMainnetAssets();
  const asset =
    assets.find(
      (item) => item.ticker === "NVDA" && item.platform === "bstock",
    ) ?? assets[0];
  if (!asset) throw new Error("No verified BSC issuer asset available.");
  const universe = await getStockUniverse();
  const coverage = stockCoverage(universe, assets);
  const periods = [];
  for (const [period, settings] of Object.entries(HISTORY_PERIODS)) {
    const raw = await binanceRequest("/api/v1/dex/market/candles", {
      binanceChainId: "56",
      tokenContractAddress: asset.address,
      bar: settings.bar,
      limit: CANDLE_LIMIT,
    });
    const parsed = parseBscCandles(raw);
    if (!parsed.length) throw new Error(`No valid observations for ${period}.`);
    periods.push({
      period,
      bar: settings.bar,
      returned: raw.length,
      parsed: parsed.length,
      latestAt: new Date(parsed.at(-1).time).toISOString(),
    });
  }
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        chainId: 56,
        asset: {
          symbol: asset.symbol,
          platform: asset.platform,
          address: asset.address,
        },
        verifiedAssets: assets.length,
        price: asset.priceUsd,
        priceObservedAt: asset.priceUpdatedAt,
        priceSource: asset.priceSource,
        freshness: priceFreshness(asset),
        priceRefreshFailures: assets.filter((asset) => asset.priceError).length,
        rosterAsOf: universe.asOf,
        rosterCompanies: universe.companyCount,
        rosterShareClasses: coverage.length,
        companiesWithBscIssuers: new Set(
          coverage
            .filter((company) => company.issuers.length)
            .map((company) => company.companyId),
        ).size,
        issuerCounts: Object.fromEntries(
          ["bstock", "ondo", "xstocks"].map((issuer) => [
            issuer,
            assets.filter((asset) => asset.platform === issuer).length,
          ]),
        ),
        periods,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Market integration unavailable.",
  );
  process.exitCode = 1;
}
