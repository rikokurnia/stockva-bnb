// Read-only provider check. No wallet signatures, approvals, or trades.
import env from "@next/env";
import { binanceRequest } from "../lib/binance-web3.ts";
import { listMainnetAssets } from "../lib/trading-server.ts";
import { parseBscCandles } from "../lib/market-observations.ts";

env.loadEnvConfig(process.cwd());
try {
  const assets = await listMainnetAssets();
  const asset =
    assets.find(
      (item) => item.ticker === "NVDA" && item.platform === "bstock",
    ) ?? assets[0];
  if (!asset) throw new Error("No verified BSC issuer asset available.");
  const raw = await binanceRequest("/api/v1/dex/market/candles", {
    binanceChainId: "56",
    tokenContractAddress: asset.address,
    bar: "1h",
    limit: "5",
  });
  const parsed = parseBscCandles(raw);
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
        candleRowsReturned: Array.isArray(raw) ? raw.length : null,
        rowShape:
          Array.isArray(raw) && Array.isArray(raw[0])
            ? raw[0].map((value) => typeof value)
            : typeof raw,
        observedCandlesParsed: parsed.length,
        latestObservationAt: parsed.at(-1)
          ? new Date(parsed.at(-1).time).toISOString()
          : null,
      },
      null,
      2,
    ),
  );
  if (Array.isArray(raw) && raw.length > 0 && parsed.length === 0)
    throw new Error(
      "The provider returned candles, but their schema did not pass observation validation.",
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Market integration unavailable.",
  );
  process.exitCode = 1;
}
