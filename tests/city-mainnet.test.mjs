import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyLayout,
  layoutKey,
  mergeReceipt,
  persistReceiptHint,
  readReceiptHints,
  receiptKey,
  unresolvedWalletTrade,
  readLayout,
  representedCity,
  serializeLayout,
} from "../lib/city-mainnet.ts";
import { catalogue, validCell } from "../lib/city.ts";

const owner = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";
const asset = {
  chainId: 56,
  address: token,
  ticker: "NVDA",
  symbol: "NVDAB",
  decimals: 18,
  platform: "bstock",
  name: "NVIDIA (bStocks)",
};
const spot = [...Array(30)]
  .flatMap((_, r) => [...Array(30)].map((_, c) => ({ r, c })))
  .find((c) =>
    [
      c,
      { r: c.r + 1, c: c.c },
      { r: c.r, c: c.c + 1 },
      { r: c.r + 1, c: c.c + 1 },
    ].every(validCell),
  );
const building = {
  ...spot,
  id: "real-holding",
  kind: catalogue.find((d) => d.ticker === "NVDA").kind,
  tokenAddress: token,
  owner,
  cost: 999,
  entry: 1,
  quantity: 999,
  builtAt: 1,
};
const layout = { chainId: 56, roads: [], buildings: [building] };
const balance = {
  chainId: 56,
  account: owner,
  fetchedAt: new Date().toISOString(),
  bnb: { raw: "1", formatted: "0.000000000000000001" },
  usdt: { raw: "500000000000000000", formatted: "0.5", decimals: 18 },
  holdings: [{ asset, raw: "20000000000000000", formatted: "0.02" }],
};

test("mainnet layout never imports simulation or another wallet's position", () => {
  assert.deepEqual(
    readLayout({ ...layout, chainId: 97 }, owner),
    emptyLayout(),
  );
  assert.equal(readLayout(layout, other).buildings.length, 0);
  assert.equal(readLayout(layout, null).buildings.length, 0);
  assert.notEqual(layoutKey(owner), layoutKey(other));
});
test("persisted invented cash, quantities and entry prices are discarded", () => {
  const result = readLayout({ ...layout, cash: 10000 }, owner);
  assert.equal(result.buildings[0].quantity, 0);
  assert.equal(result.buildings[0].entry, 0);
  assert.equal(serializeLayout(layout).buildings[0].cost, 0);
  const city = representedCity(result, balance);
  assert.equal(city.cash, 0.5);
  assert.equal(city.buildings[0].quantity, 0.02);
  assert.equal(city.buildings[0].entry, 0);
});
test("unavailable wallet does not retain a holding or synthesize spendable cash", () => {
  const city = representedCity(layout, null);
  assert.equal(city.cash, 0);
  assert.equal(city.buildings[0].quantity, 0);
  assert.equal(city.buildings[0].locked, true);
});
test("one token cannot be counted twice through multiple map buildings", () => {
  const city = representedCity(
    { ...layout, buildings: [building, { ...building, id: "duplicate" }] },
    balance,
  );
  assert.equal(
    city.buildings.reduce((n, b) => n + b.quantity, 0),
    0.02,
  );
});
test("pending, foreign and mismatched purchases cannot create an entry price", () => {
  const receipt = {
    quoteId: "q",
    status: "PENDING",
    account: owner,
    asset,
    side: "buy",
    txHash: "0xabc",
    fromFormatted: "1",
    toFormatted: "0.02",
  };
  assert.equal(
    representedCity(layout, balance, [receipt]).buildings[0].entry,
    0,
  );
  assert.equal(
    representedCity(layout, balance, [
      { ...receipt, status: "FILLED", account: other },
    ]).buildings[0].entry,
    0,
  );
  assert.equal(
    representedCity(layout, balance, [
      { ...receipt, status: "FILLED", toFormatted: "0.03" },
    ]).buildings[0].entry,
    0,
  );
  assert.equal(
    representedCity(layout, balance, [{ ...receipt, status: "FILLED" }])
      .buildings[0].entry,
    50,
  );
});
test("repeated receipt reconciliation replaces the order without double counting", () => {
  const pending = { quoteId: "q", status: "PENDING" };
  const confirmed = { quoteId: "q", status: "FILLED" };
  assert.deepEqual(mergeReceipt([pending], confirmed), [confirmed]);
});

test("corrupt road rows and mismatched issuer-building pairs cannot fabricate positions", () => {
  assert.doesNotThrow(() =>
    readLayout({ ...layout, roads: [null, "bad", { r: NaN, c: 0 }] }, owner),
  );
  const wrongKind = catalogue.find((d) => d.ticker === "AAPL").kind;
  const city = representedCity(
    { ...layout, buildings: [{ ...building, kind: wrongKind }] },
    balance,
  );
  assert.equal(city.buildings[0].quantity, 0);
  assert.equal(city.buildings[0].locked, true);
});

test("a broadcast after wallet switching stays discoverable for its signing account", () => {
  const stored = new Map();
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  const receipt = {
    quoteId: "broadcast-after-switch",
    account: owner,
    asset,
    status: "FILLED",
    side: "buy",
    txHash: "0xabc",
    recoveryToken: "encrypted-ticket",
  };
  persistReceiptHint(storage, receipt);
  assert.equal(storage.getItem(receiptKey(other)), null);
  const hints = readReceiptHints(
    JSON.parse(storage.getItem(receiptKey(owner))),
    owner,
  );
  assert.equal(hints.length, 1);
  assert.equal(hints[0].txHash, receipt.txHash);
  assert.equal(
    hints[0].status,
    "PENDING",
    "a saved fill must be reverified on chain",
  );
  persistReceiptHint(storage, { ...receipt, status: "PENDING" });
  assert.equal(JSON.parse(storage.getItem(receiptKey(owner))).length, 1);
  assert.deepEqual(
    readReceiptHints(JSON.parse(storage.getItem(receiptKey(owner))), other),
    [],
  );
});

test("a pending broadcast blocks a different quote for the same wallet across tabs", () => {
  const pending = {
    account: owner,
    asset,
    quoteId: "existing",
    status: "PENDING",
    txHash: `0x${"a".repeat(64)}`,
  };
  assert.equal(unresolvedWalletTrade([pending], owner, "new"), true);
  assert.equal(unresolvedWalletTrade([pending], other, "new"), false);
  assert.equal(unresolvedWalletTrade([pending], owner, "existing"), false);
  assert.equal(
    unresolvedWalletTrade([{ ...pending, status: "FILLED" }], owner, "new"),
    false,
  );
  assert.equal(
    unresolvedWalletTrade([{ ...pending, txHash: null }], owner, "new"),
    false,
  );
  assert.equal(
    unresolvedWalletTrade(
      [{ ...pending, asset: { ...asset, chainId: 97 } }],
      owner,
      "new",
    ),
    false,
  );
});
