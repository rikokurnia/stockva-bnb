const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
const at = Date.UTC(2026, 9, 5);
const assets = [
  {
    address: "0x1111111111111111111111111111111111111111",
    chainId: 56,
    ticker: "AAPL",
    symbol: "AAPLon",
    platform: "ondo",
    name: "Apple",
    priceUsd: "100",
    referencePriceUsd: "99",
    priceUpdatedAt: new Date(at).toISOString(),
    decimals: 18,
  },
  {
    address: "0x2222222222222222222222222222222222222222",
    chainId: 56,
    ticker: "AAPL",
    symbol: "AAPLB",
    platform: "bstock",
    name: "Apple",
    priceUsd: "101",
    referencePriceUsd: "99",
    priceUpdatedAt: new Date(at).toISOString(),
    decimals: 18,
  },
];
let available = assets;
let candles = [[100, 102, 99, 101, 7, at, 2]];
let requestedContract = null;
function replaceModule(file, exports) {
  const filename = path.resolve(__dirname, file);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
replaceModule("../lib/trading-server.ts", {
  listMainnetAssets: async () => available,
});
replaceModule("../lib/binance-web3.ts", {
  binanceRequest: async (_endpoint, params) => {
    requestedContract = params.tokenContractAddress;
    return candles;
  },
});
replaceModule("../lib/rwa-server.ts", {
  rwaCompany: async (_ticker, contract) => ({
    attestations: [
      { label: "Issuer attestation", url: `https://example.com/${contract}` },
    ],
  }),
  rwaSession: async () => ({ state: "unknown", provenance: "unavailable" }),
});
const { GET: history } = require("../app/api/history/route.ts");
const { GET: passport } = require("../app/api/passport/route.ts");
const { GET: market } = require("../app/api/market/route.ts");
const { NextRequest } = require("next/server");
const request = (query) => new NextRequest(`http://local/api/${query}`);
const underlying = {
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: 103,
          regularMarketTime: at / 1000,
          exchangeName: "NMS",
        },
        timestamp: [at / 1000],
        indicators: { quote: [{ close: [103] }] },
      },
    ],
  },
};

test("history retains BSC observations for the explicitly chosen issuer and separate underlying reference", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify(underlying));
  try {
    const result = await (
      await history(
        request(`history?ticker=AAPL&contract=${assets[1].address}`),
      )
    ).json();
    assert.equal(requestedContract, assets[1].address);
    assert.equal(result.contract, assets[1].address);
    assert.deepEqual(result.points, [
      {
        time: at,
        token: 101,
        open: 100,
        high: 102,
        low: 99,
        volume: 7,
        benchmark: 103,
      },
    ]);
    assert.equal(result.simulated, false);
    assert.match(result.tokenSource, /AAPLB/);
  } finally {
    global.fetch = original;
  }
});

test("history never turns an underlying reference into missing token data", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify(underlying));
  candles = [];
  try {
    const result = await (await history(request("history?ticker=AAPL"))).json();
    assert.deepEqual(result.points, [{ time: at, benchmark: 103 }]);
    assert.equal(result.simulated, false);
    assert.match(result.error, /No observed BSC token history/);
    assert.equal(
      (await history(request("history?ticker=AAPL&contract=http://bad")))
        .status,
      400,
    );
    assert.equal(
      (await history(request("history?ticker=AAPL&range=unknown"))).status,
      400,
    );
  } finally {
    global.fetch = original;
    candles = [[100, 102, 99, 101, 7, at, 2]];
  }
});

test("passport keeps the selected BStock contract without borrowing xStocks reserve data", async () => {
  const original = global.fetch;
  global.fetch = async () => {
    throw Error("Unexpected issuer request");
  };
  try {
    const result = await (
      await passport(
        request(`passport?ticker=AAPL&contract=${assets[1].address}`),
      )
    ).json();
    assert.equal(result.platform, "bstock");
    assert.equal(result.symbol, "AAPLB");
    assert.equal(result.deployments[0].address, assets[1].address);
    assert.equal(result.reserve, undefined);
    const missing = await (
      await passport(
        request(
          "passport?ticker=AAPL&contract=0x3333333333333333333333333333333333333333",
        ),
      )
    ).json();
    assert.deepEqual(missing.deployments, []);
    assert.match(missing.error, /No supported BSC issuer/);
  } finally {
    global.fetch = original;
  }
});

test("market unavailable quotes have no fabricated source or static catalogue price", async () => {
  available = [];
  try {
    const result = await (await market()).json();
    assert.equal(result.quotes.AAPL.status, "unavailable");
    assert.equal(result.quotes.AAPL.price, 0);
    assert.equal(result.quotes.AAPL.source, null);
    assert.match(result.error, /unavailable/);
  } finally {
    available = assets;
  }
});
