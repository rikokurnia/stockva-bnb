import test from "node:test";
import assert from "node:assert/strict";
import { assetResearchUrl, observedPrice, walletHolding } from "../lib/mainnet-research.ts";

const selected = {
  chainId: 56,
  address: "0x3333333333333333333333333333333333333333",
  ticker: "NVDA",
  symbol: "NVDAB",
  priceUsd: null,
  platform: "bstock",
};

test("a missing issuer observation never becomes the catalogue or underlying price", () => {
  assert.equal(observedPrice({ ...selected, referencePriceUsd: "150", priceUsd: null }), null);
  assert.equal(observedPrice({ ...selected, priceUsd: "NaN" }), null);
  assert.equal(observedPrice({ ...selected, priceUsd: "0" }), null);
  assert.equal(observedPrice({ ...selected, priceUsd: "123.45" }), 123.45);
});

test("research and evidence requests always select the precise issuer contract", () => {
  for (const path of ["/api/history", "/api/passport", "/api/rwa/passport"]) {
    const url = new URL(assetResearchUrl(path, selected), "https://stockva.example");
    assert.equal(url.searchParams.get("ticker"), "NVDA");
    assert.equal(url.searchParams.get("contract"), selected.address);
  }
});

test("another issuer for the same company cannot provide the displayed wallet holding", () => {
  const held = { asset: { ...selected, address: "0x4444444444444444444444444444444444444444", symbol: "NVDAx" }, raw: "100", formatted: "0.1" };
  assert.equal(walletHolding({ chainId: 56, holdings: [held] }, selected), undefined);
  assert.equal(walletHolding({ chainId: 97, holdings: [{ ...held, asset: selected }] }, selected), undefined);
  assert.equal(walletHolding(null, selected), undefined);
  assert.equal(walletHolding({ chainId: 56, holdings: [{ ...held, asset: selected }] }, selected)?.raw, "100");
});
