import test from "node:test";
import assert from "node:assert/strict";
import { chartObservations } from "../lib/chart-indicators.ts";
import {
  relativeStrength,
  relativeStrengthSeries,
} from "../lib/asset-research.ts";

const now = Date.UTC(2026, 9, 8, 12);
test("MA warmup uses earlier actual closes and shares the plotted price window", () => {
  const points = Array.from({ length: 100 }, (_, i) => ({
    time: now - (99 - i) * 60000,
    token: i + 1,
  }));
  const plot = chartObservations(points, "token", "1h", false, now);
  assert.equal(plot.price.length, 61);
  assert.equal(plot.ma20[0].time, plot.price[0].time);
  assert.equal(plot.ma20[0].value, 30.5);
  assert.equal(plot.sma50[0].time, points[49].time);
  assert.equal(plot.sma50[0].value, 25.5);
  assert.equal(plot.sma50.at(-1).value, 75.5);
  assert.deepEqual(
    chartObservations(points, "token", "1h", true, now).price,
    [],
  );
});

test("source volume stays independent, preserves zero and rejects missing or invalid observations", () => {
  const points = [
    {
      time: now - 5000,
      token: 10,
      open: 11,
      volume: 4,
      benchmark: 100,
      benchmarkOpen: 90,
      benchmarkVolume: 40,
    },
    { time: now - 4000, token: 12, volume: 0, benchmark: 102 },
    {
      time: now - 3000,
      token: 14,
      volume: -1,
      benchmark: 104,
      benchmarkVolume: null,
    },
    { time: now - 2000, token: 16, volume: Infinity },
    { time: now - 1000, benchmark: 106, volume: 900 },
    { time: now + 1000, token: 20, volume: 9 },
    { time: NaN, token: 20, volume: 9 },
  ];
  const token = chartObservations(points, "token", "1d", false, now);
  const stock = chartObservations(points, "benchmark", "1d", false, now);
  assert.deepEqual(
    token.volume.map((p) => [p.value, p.direction]),
    [
      [4, "down"],
      [0, "flat"],
    ],
  );
  assert.deepEqual(
    stock.volume.map((p) => [p.value, p.direction]),
    [[40, "up"]],
  );
  assert.equal(token.price.length, 4);
  assert.equal(stock.price.length, 4);
  assert.equal(token.ma10.length, 0);
  assert.equal(token.rsi.length, 0);
  assert.equal(
    chartObservations(points, "token", "1d", true, now).volume.length,
    0,
  );
});

test("Wilder RSI matches the reference calculation and requires 14 actual deltas", () => {
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28, 46.0,
  ];
  const points = closes.map((value, i) => ({
    time: now - (closes.length - i) * 60000,
    value,
  }));
  const rsi = relativeStrengthSeries(points);
  assert.equal(rsi.length, 2);
  assert.ok(Math.abs(rsi[0].value - 70.46413502109705) < 1e-10);
  assert.ok(Math.abs(rsi[1].value - 66.24961855355505) < 1e-10);
  assert.equal(relativeStrength(points), rsi.at(-1).value);
  for (const [values, expected] of [
    [Array.from({ length: 20 }, (_, i) => i + 1), 100],
    [Array.from({ length: 20 }, (_, i) => 20 - i), 0],
    [Array(20).fill(10), 50],
  ])
    assert.ok(
      relativeStrengthSeries(
        values.map((value, time) => ({ time, value })),
      ).every((p) => p.value === expected),
    );
  assert.deepEqual(relativeStrengthSeries(points.slice(0, 14)), []);
});

test("unsorted and duplicate bars are normalized without filling price gaps", () => {
  const points = [
    { time: now - 1000, token: 3, volume: 3 },
    { time: now - 9000, token: 1, volume: 1 },
    { time: now - 9000, token: 2, volume: 2 },
    { time: now - 5000, token: 0, volume: 999 },
  ];
  const plot = chartObservations(points, "token", "1h", false, now);
  assert.deepEqual(plot.price, [
    { time: now - 9000, value: 2 },
    { time: now - 1000, value: 3 },
  ]);
  assert.deepEqual(
    plot.volume.map((p) => p.value),
    [2, 3],
  );
});
