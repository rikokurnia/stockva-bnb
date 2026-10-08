import test from "node:test";
import assert from "node:assert/strict";
import {
  SP100_SNAPSHOT,
  parseStockHoldings,
  priceFreshness,
  stockCoverage,
  preferredIssuer,
} from "../lib/stock-universe.ts";
import { applyPriceObservations } from "../lib/market-prices.ts";
const address = "0x" + "a".repeat(40);
const asset = {
  address,
  chainId: 56,
  ticker: "BRKB",
  platform: "bstock",
  priceUsd: "10",
  priceUpdatedAt: null,
  fetchedAt: new Date().toISOString(),
};

test("research roster reconciles to 100 companies, retains both Alphabet classes and excludes ETFs/prices", () => {
  assert.equal(SP100_SNAPSHOT.companies.length, 101);
  assert.equal(
    new Set(SP100_SNAPSHOT.companies.map((company) => company.companyId)).size,
    100,
  );
  for (const company of SP100_SNAPSHOT.companies) {
    assert.deepEqual(Object.keys(company).sort(), [
      "companyId",
      "name",
      "sector",
      "ticker",
    ]);
    assert.ok(!["SPY", "QQQ", "IWM", "VOO", "VTI"].includes(company.ticker));
  }
  assert.equal(
    SP100_SNAPSHOT.companies.find((company) => company.ticker === "GOOG")
      .companyId,
    SP100_SNAPSHOT.companies.find((company) => company.ticker === "GOOGL")
      .companyId,
  );
});
test("published holdings parser preserves quoted names, excludes cash and refuses an incomplete universe", () => {
  const csv =
    "Ticker,Name,Sector,Asset Class\n" +
    SP100_SNAPSHOT.companies
      .map(
        (company) =>
          `${company.ticker},"${company.name}",${company.sector},Equity`,
      )
      .join("\n") +
    '\nUSD,"Cash, USD",Cash,Cash';
  assert.equal(parseStockHoldings(csv).length, 101);
  assert.throws(
    () =>
      parseStockHoldings(
        "Ticker,Name,Sector,Asset Class\nAAPL,Apple,Tech,Equity",
      ),
    /100 equity companies/,
  );
  assert.throws(
    () => parseStockHoldings(csv + '\n"unterminated'),
    /Incomplete/,
  );
});
test("coverage matches share-class aliases, requires BSC and defaults to bStocks", () => {
  const coverage = stockCoverage(SP100_SNAPSHOT, [
    asset,
    { ...asset, chainId: 1 },
  ]);
  assert.equal(
    coverage.find((company) => company.ticker === "BRK.B").issuers.length,
    1,
  );
  assert.equal(
    preferredIssuer([{ ...asset, platform: "ondo" }, asset]).platform,
    "bstock",
  );
});
test("retrieval time never establishes freshness; old or invalid observations stay visibly stale/unknown", () => {
  const now = Date.now();
  assert.equal(priceFreshness(asset, now).status, "unknown");
  assert.equal(
    priceFreshness({ ...asset, priceUpdatedAt: "invalid" }, now).status,
    "unknown",
  );
  assert.equal(
    priceFreshness(
      { ...asset, priceUpdatedAt: new Date(now - 121000).toISOString() },
      now,
    ).status,
    "stale",
  );
  assert.equal(
    priceFreshness(
      { ...asset, priceUpdatedAt: new Date(now).toISOString() },
      now,
    ).status,
    "observed",
  );
  assert.equal(
    priceFreshness({ ...asset, priceUsd: "0" }, now).status,
    "unavailable",
  );
});
test("market prices require exact chain/contract identity and valid provider milliseconds", () => {
  const now = Date.now();
  const row = {
    binanceChainId: "56",
    tokenContractAddress: address.toUpperCase().replace("0X", "0x"),
    price: "11",
    time: now - 1000,
  };
  const valid = applyPriceObservations([asset], [row], now)[0];
  assert.equal(valid.priceUsd, "11");
  assert.equal(valid.priceUpdatedAt, new Date(now - 1000).toISOString());
  assert.equal(valid.priceSource, "market");
  for (const invalid of [
    { ...row, binanceChainId: "1" },
    { ...row, tokenContractAddress: "0x" + "b".repeat(40) },
    { ...row, time: now + 10000 },
    { ...row, time: now / 1000 },
    { ...row, price: "NaN" },
  ]) {
    const result = applyPriceObservations([asset], [invalid], now)[0];
    assert.equal(result.priceUsd, asset.priceUsd);
    assert.equal(result.priceUpdatedAt, null);
    assert.ok(result.priceError);
  }
});
