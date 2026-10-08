const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const trading = require("../lib/trading-server.ts");
const binance = require("../lib/binance-web3.ts");
const universe = require("../lib/stock-universe-server.ts");
const { SP100_SNAPSHOT } = require("../lib/stock-universe.ts");
universe.getStockUniverse = async () => SP100_SNAPSHOT;
const { GET } = require("../app/api/history/route.ts");
const { NextRequest } = require("next/server");
const address = "0x" + "a".repeat(40);
const other = "0x" + "b".repeat(40);
const asset = {
  address,
  chainId: 56,
  ticker: "NVDA",
  symbol: "NVDAB",
  platform: "bstock",
};
const request = (query) => new NextRequest(`http://local/api/history?${query}`);
const underlying = () =>
  new Response(
    JSON.stringify({
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: 12,
              regularMarketTime: Math.floor(Date.now() / 1000),
              exchangeName: "NMS",
            },
            timestamp: [Math.floor(Date.now() / 1000) - 60],
            indicators: { quote: [{ close: [12] }] },
          },
        ],
      },
    }),
  );

test("history fetches 100 candles with each timeframe and includes assets outside the legacy list", async () => {
  const original = global.fetch;
  global.fetch = async () => underlying();
  trading.listMainnetAssets = async () => [
    asset,
    { ...asset, ticker: "NEW", address: other, symbol: "NEWB" },
  ];
  try {
    for (const [period, bar] of [
      ["1h", "1m"],
      ["1d", "15m"],
      ["1w", "2h"],
    ]) {
      binance.binanceRequest = async (path, params) => {
        assert.equal(params.limit, "100");
        assert.equal(params.bar, bar);
        assert.equal(params.tokenContractAddress, other);
        return [[10, 13, 9, 11, 2, Date.now() - 1000, 1]];
      };
      const response = await GET(
        request(`ticker=NEW&contract=${other}&period=${period}`),
      );
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.simulated, false);
      assert.equal(data.contract, other);
      assert.equal(
        data.points.filter((point) => point.token !== undefined).length,
        1,
      );
      assert.equal(
        data.points.filter((point) => point.benchmark !== undefined).length,
        1,
      );
    }
  } finally {
    global.fetch = original;
  }
});
test("issuer mismatch cannot borrow another contract; token outages preserve separate underlying data and provider errors", async () => {
  const original = global.fetch;
  global.fetch = async () => underlying();
  trading.listMainnetAssets = async () => [asset];
  let calls = 0;
  binance.binanceRequest = async () => {
    calls++;
    throw new Error("Binance 40001: invalid limit range");
  };
  try {
    const mismatch = await (
      await GET(request(`ticker=NVDA&contract=${other}`))
    ).json();
    assert.equal(calls, 0);
    assert.equal(mismatch.contract, undefined);
    assert.ok(mismatch.points.every((point) => point.token === undefined));
    const outage = await (
      await GET(request(`ticker=NVDA&contract=${address}`))
    ).json();
    assert.equal(calls, 1);
    assert.match(outage.tokenError, /invalid limit range/);
    assert.ok(outage.points.some((point) => point.benchmark === 12));
    assert.ok(outage.points.every((point) => point.token === undefined));
    assert.equal((await GET(request("ticker=UNKNOWN"))).status, 400);
    assert.equal(
      (await GET(request("ticker=NVDA&period=toString"))).status,
      400,
    );
  } finally {
    global.fetch = original;
  }
});
test("S&P 100 research remains available when the entire issuer catalogue fails", async () => {
  const original = global.fetch;
  global.fetch = async () => underlying();
  trading.listMainnetAssets = async () => {
    throw new Error("Issuer service offline");
  };
  try {
    const data = await (await GET(request("ticker=SNDK&period=1w"))).json();
    assert.equal(data.contract, undefined);
    assert.match(data.tokenError, /offline/);
    assert.ok(data.points.some((point) => point.benchmark === 12));
  } finally {
    global.fetch = original;
  }
});
