import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBscCandles,
  selectMainnetAsset,
} from "../lib/market-observations.ts";

const at = Date.UTC(2026, 9, 5);
test("BSC candle parser preserves only observed OHLC and volume, sorted and deduplicated", () => {
  assert.deepEqual(
    parseBscCandles(
      [
        [101, 104, 100, 103, 4, at + 60000, 3],
        [100, 102, 99, 101, 7, at, 2],
        [101, 105, 100, 104, 8, at + 60000, 4],
      ],
      at + 120000,
    ),
    [
      { time: at, token: 101, open: 100, high: 102, low: 99, volume: 7 },
      {
        time: at + 60000,
        token: 104,
        open: 101,
        high: 105,
        low: 100,
        volume: 8,
      },
    ],
  );
});

test("missing, inconsistent, non-finite, seconds-format and future candles never make observations", () => {
  assert.deepEqual(
    parseBscCandles(
      [
        [],
        [100, 99, 98, 101, 7, at],
        [100, 102, 101, 101, 7, at],
        ["bad", 102, 99, 101, 7, at],
        [100, 102, 99, 101, 7, at / 1000],
        [100, 102, 99, 101, 7, at + 60000],
        [0, 2, 0, 1, 7, at],
      ],
      at,
    ),
    [],
  );
  assert.deepEqual(parseBscCandles(null, at), []);
});

test("token research selects an exact BSC contract and never substitutes another issuer", () => {
  const rows = [
    {
      address: "0x2222222222222222222222222222222222222222",
      chainId: 56,
      ticker: "NVDA",
      platform: "bstock",
    },
    {
      address: "0x1111111111111111111111111111111111111111",
      chainId: 56,
      ticker: "NVDA",
      platform: "ondo",
    },
    {
      address: "0x3333333333333333333333333333333333333333",
      chainId: 97,
      ticker: "NVDA",
      platform: "ondo",
    },
  ];
  assert.equal(selectMainnetAsset(rows, "NVDA").platform, "ondo");
  assert.equal(
    selectMainnetAsset(rows, "NVDA", rows[0].address).platform,
    "bstock",
  );
  assert.equal(selectMainnetAsset(rows, "NVDA", rows[2].address), undefined);
  assert.equal(selectMainnetAsset(rows, "AAPL", rows[0].address), undefined);
  assert.equal(
    selectMainnetAsset(
      rows,
      "NVDA",
      "0x4444444444444444444444444444444444444444",
    ),
    undefined,
  );
});
