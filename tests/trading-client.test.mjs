import test from "node:test";
import assert from "node:assert/strict";
import { getTradeStatus, recordBroadcast } from "../lib/trading-client.ts";

const txHash = `0x${"a".repeat(64)}`;
function browserStorage(t, storage) {
  for (const [key, value] of Object.entries({
    window: {},
    localStorage: storage,
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
    t.after(() =>
      descriptor
        ? Object.defineProperty(globalThis, key, descriptor)
        : delete globalThis[key],
    );
  }
}

test("a broadcast hash reaches the UI even when browser storage fails after signing", (t) => {
  browserStorage(t, {
    getItem: () => null,
    setItem: () => {
      throw Error("quota exceeded");
    },
  });
  const progress = [];
  assert.doesNotThrow(() =>
    recordBroadcast(
      { quoteId: "quota", recoveryToken: "ticket" },
      txHash,
      (p) => progress.push(p),
    ),
  );
  assert.equal(progress[0].txHash, txHash);
  assert.equal(progress.at(-1).txHash, txHash);
  assert.match(progress.at(-1).stage, /keep this transaction hash/);
});

test("status uses the newly tracked recovery ticket across server workers despite storage failure", async (t) => {
  browserStorage(t, {
    getItem: () => null,
    setItem: () => {
      throw Error("quota exceeded");
    },
  });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    const body = JSON.parse(options.body);
    calls.push({ path, body });
    return Response.json({
      quoteId: "restart",
      txHash,
      status: path.endsWith("track") ? "PENDING" : "FILLED",
      recoveryToken: "tracked-with-hash",
    });
  });
  const receipt = await getTradeStatus(
    "restart",
    "initial-build-ticket",
    txHash,
  );
  assert.equal(receipt.status, "FILLED");
  assert.equal(calls[0].path, "/api/trading/track");
  assert.equal(calls[0].body.txHash, txHash);
  assert.equal(calls[0].body.recoveryToken, "initial-build-ticket");
  assert.equal(calls[1].path, "/api/trading/status");
  assert.equal(calls[1].body.recoveryToken, "tracked-with-hash");
});
