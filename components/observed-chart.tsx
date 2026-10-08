"use client";
import { useEffect, useMemo, useState } from "react";
import type { HistoryFeed } from "../lib/market";
import TradingChart, { type Timeframe } from "./trading-chart";
import styles from "./civic-panel.module.css";

/** Research charts show provider observations; every missing interval stays missing. */
export default function ObservedChart({
  history,
  livePrice,
  compare = false,
  onSourceChange,
  source: controlledSource,
  timeframe,
  onTimeframeChange,
  underlyingOnly = false,
}: {
  history: HistoryFeed;
  timeframe?: Timeframe;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  underlyingOnly?: boolean;
  livePrice?: number;
  compare?: boolean;
  source?: "token" | "benchmark";
  onSourceChange?: (source: "token" | "benchmark") => void;
}) {
  const [localSource, setSource] = useState<"token" | "benchmark">(
    underlyingOnly ? "benchmark" : "token",
  );
  const source = controlledSource ?? localSource;
  const changeSource = (next: "token" | "benchmark") => {
    setSource(next);
    onSourceChange?.(next);
  };
  useEffect(() => {
    onSourceChange?.(source);
  }, [source, onSourceChange]);
  const underlying = underlyingOnly || (!compare && source === "benchmark");
  const points = useMemo(
    () =>
      history.simulated
        ? []
        : underlying
          ? history.points.map((point) => ({
              time: point.time,
              token: point.benchmark,
            }))
          : history.points,
    [history.simulated, history.points, underlying],
  );
  return (
    <div>
      {!compare && !underlyingOnly && (
        <div
          className={styles.chartControls}
          aria-label="Observed price source"
        >
          <button
            type="button"
            aria-pressed={source === "token"}
            onClick={() => changeSource("token")}
          >
            BSC token
          </button>
          <button
            type="button"
            aria-pressed={source === "benchmark"}
            onClick={() => changeSource("benchmark")}
          >
            Underlying reference
          </button>
        </div>
      )}
      <TradingChart
        points={points}
        timeframe={timeframe}
        onTimeframeChange={onTimeframeChange}
        compare={compare}
        livePrice={underlying ? undefined : livePrice}
        tokenName={underlying ? "Underlying reference" : "BSC issuer token"}
        benchmarkName="Underlying reference"
        contract={underlying ? undefined : history.contract}
      />
      <p className={styles.caption}>
        {underlying ? history.benchmarkSource : history.tokenSource}.
        {history.contract && !underlying
          ? ` Contract ${history.contract}.`
          : ""}{" "}
        Charts do not establish an executable price.
      </p>
      {(underlying || compare) && history.benchmarkError && (
        <p className={styles.notice}>{history.benchmarkError}</p>
      )}
      {!underlying && (history.tokenError ?? history.error) && (
        <p className={styles.notice}>{history.tokenError ?? history.error}</p>
      )}
    </div>
  );
}
