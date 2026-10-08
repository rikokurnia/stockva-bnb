import {
  movingAverage,
  relativeStrengthSeries,
  type ObservedPoint,
} from "./asset-research.ts";
import type { PricePoint } from "./market";

export type ChartIndicators = {
  volume: boolean;
  ma10: boolean;
  ma20: boolean;
  sma50: boolean;
  rsi: boolean;
};
export const DEFAULT_CHART_INDICATORS: ChartIndicators = {
  volume: true,
  ma10: false,
  ma20: true,
  sma50: true,
  rsi: false,
};

/** Warm up indicators with earlier real bars, then clip all plots to the same window. */
export function chartObservations(
  points: PricePoint[],
  source: "token" | "benchmark",
  timeframe: "1h" | "1d" | "1w",
  simulated = false,
  now = Date.now(),
) {
  const unique = new Map<number, PricePoint>();
  for (const point of simulated ? [] : points) {
    const value = point[source];
    if (
      Number.isFinite(point.time) &&
      point.time > 0 &&
      point.time <= now &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0
    ) {
      unique.set(Math.floor(point.time / 1000) * 1000, point);
    }
  }
  const observations = [...unique].sort(([a], [b]) => a - b);
  const closes: ObservedPoint[] = observations.map(([time, point]) => ({
    time,
    value: point[source]!,
  }));
  const cutoff =
    now -
    (timeframe === "1h"
      ? 3600000
      : timeframe === "1d"
        ? 86400000
        : 7 * 86400000);
  const clip = <T extends { time: number }>(data: T[]) =>
    data.filter((point) => point.time >= cutoff);
  const volume = observations.flatMap(([time, point]) => {
    const value = source === "token" ? point.volume : point.benchmarkVolume;
    const open = source === "token" ? point.open : point.benchmarkOpen;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      return [];
    const direction =
      typeof open === "number" && Number.isFinite(open) && open > 0
        ? point[source]! >= open
          ? "up"
          : "down"
        : "flat";
    return [{ time, value, direction }];
  });
  return {
    price: clip(closes),
    volume: clip(volume),
    ma10: clip(movingAverage(closes, 10)),
    ma20: clip(movingAverage(closes, 20)),
    sma50: clip(movingAverage(closes, 50)),
    rsi: clip(relativeStrengthSeries(closes, 14)),
  };
}
