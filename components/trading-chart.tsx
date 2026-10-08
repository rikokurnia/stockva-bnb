"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  AreaSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PricePoint } from "../lib/market";
import { money, pct } from "../lib/city";
import styles from "./trading-chart.module.css";

export type Timeframe = "1h" | "1d" | "1w";

type Props = {
  points: PricePoint[];
  timeframe?: Timeframe;
  onTimeframeChange?: (timeframe: Timeframe) => void;
  compare?: boolean;
  simulated?: boolean;
  ticker?: string;
  contract?: string;
  tokenName?: string;
  benchmarkName?: string;
  defaultPrice?: number;
  livePrice?: number;
  liveChange?: number;
};

type HoverState = {
  timeStr: string;
  tokenPrice?: number;
  benchmarkPrice?: number;
};

export default function TradingChart({
  points,
  timeframe: controlledTimeframe,
  onTimeframeChange,
  compare = false,
  simulated = false,
  ticker,
  contract,
  tokenName,
  benchmarkName = "Underlying Stock",
  defaultPrice,
  livePrice,
  liveChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const tokenSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const benchmarkSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [localTimeframe, setTimeframe] = useState<Timeframe>("1d");
  const timeframe = controlledTimeframe ?? localTimeframe;
  const [hoverData, setHoverData] = useState<HoverState | null>(null);

  const activePrice =
    livePrice !== undefined && Number.isFinite(livePrice) && livePrice > 0
      ? livePrice
      : undefined;

  // Only provider observations appear on the chart. Current quote display does
  // not alter timestamps or fill gaps in the historical series.
  const { tokenData, benchmarkData, latestToken, priceChangePct, isPositive } =
    useMemo(() => {
      const windowMs =
        timeframe === "1h"
          ? 3600000
          : timeframe === "1d"
            ? 86400000
            : 7 * 86400000;
      const cutoff = Date.now() - windowMs;
      const tokens = new Map<number, number>();
      const references = new Map<number, number>();
      for (const point of simulated
        ? []
        : [...points].sort((a, b) => a.time - b.time)) {
        if (
          !Number.isFinite(point.time) ||
          point.time < cutoff ||
          point.time > Date.now()
        )
          continue;
        const time = Math.floor(point.time / 1000);
        if (
          point.token !== undefined &&
          Number.isFinite(point.token) &&
          point.token > 0
        )
          tokens.set(time, point.token);
        if (
          compare &&
          point.benchmark !== undefined &&
          Number.isFinite(point.benchmark) &&
          point.benchmark > 0
        )
          references.set(time, point.benchmark);
      }
      const tokenSeries = [...tokens].map(([time, value]) => ({
        time: time as UTCTimestamp,
        value,
      }));
      const benchSeries = [...references].map(([time, value]) => ({
        time: time as UTCTimestamp,
        value,
      }));
      const first = tokenSeries[0]?.value;
      const last = tokenSeries.at(-1)?.value;
      const change =
        first !== undefined && last !== undefined && tokenSeries.length > 1
          ? ((last - first) / first) * 100
          : undefined;
      return {
        tokenData: tokenSeries,
        benchmarkData: benchSeries,
        latestToken: last,
        priceChangePct: change,
        isPositive: change === undefined || change >= 0,
      };
    }, [points, timeframe, compare, simulated]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing chart on unmount or timeframe change
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      tokenSeriesRef.current = null;
      benchmarkSeriesRef.current = null;
    }

    if (tokenData.length === 0 && benchmarkData.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || 400;
    const height = 220;

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontSize: 10,
        fontFamily: "var(--font-mono, monospace), system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.04)" },
        horzLines: { color: "rgba(255, 255, 255, 0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(255, 255, 255, 0.3)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0f172a",
        },
        horzLine: {
          color: "rgba(255, 255, 255, 0.3)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0f172a",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: timeframe === "1h" ? 16 : timeframe === "1d" ? 14 : 9,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      // FULL SCROLL AND SCALE ENABLED - user can drag and scroll to the left freely!
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Primary Area Series with dynamic green / red theme
    const primaryColor = isPositive ? "#10b981" : "#f43f5e";
    const topGradient = isPositive
      ? "rgba(16, 185, 129, 0.32)"
      : "rgba(244, 63, 94, 0.32)";
    const bottomGradient = isPositive
      ? "rgba(16, 185, 129, 0.0)"
      : "rgba(244, 63, 94, 0.0)";

    const tokenSeries = chart.addSeries(AreaSeries, {
      topColor: topGradient,
      bottomColor: bottomGradient,
      lineColor: primaryColor,
      lineWidth: 2,
      priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
      },
    });

    tokenSeries.setData(tokenData);
    tokenSeriesRef.current = tokenSeries;

    if (compare && benchmarkData.length > 0) {
      const benchmarkSeries = chart.addSeries(LineSeries, {
        color: "#38bdf8",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        title: "Underlying",
        priceFormat: {
          type: "price",
          precision: 2,
          minMove: 0.01,
        },
      });
      benchmarkSeries.setData(benchmarkData);
      benchmarkSeriesRef.current = benchmarkSeries;
    }

    // Set visible range to the latest bars, leaving previous bars scrollable to the left
    const totalBars = new Set(
      [...tokenData, ...benchmarkData].map((point) => point.time),
    ).size;
    const visibleBars = timeframe === "1h" ? 22 : timeframe === "1d" ? 24 : 45;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, totalBars - visibleBars),
      to: totalBars + 4,
    });

    // Crosshair hover listener
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        setHoverData(null);
      } else {
        const tokenVal = param.seriesData.get(tokenSeries) as
          { value?: number } | undefined;
        const benchVal = benchmarkSeriesRef.current
          ? (param.seriesData.get(benchmarkSeriesRef.current) as
              { value?: number } | undefined)
          : undefined;

        const timeNum = typeof param.time === "number" ? param.time * 1000 : 0;
        const timeStr = timeNum
          ? new Date(timeNum).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        setHoverData({
          timeStr,
          tokenPrice: tokenVal?.value,
          benchmarkPrice: benchVal?.value,
        });
      }
    });

    // Responsive resize
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !chartRef.current) return;
      const { width } = entries[0].contentRect;
      if (width > 0) {
        chartRef.current.applyOptions({ width });
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        tokenSeriesRef.current = null;
        benchmarkSeriesRef.current = null;
      }
    };
  }, [tokenData, benchmarkData, compare, isPositive, timeframe]);

  // Compute live spread if in compare mode
  const currentSpread = useMemo(() => {
    const t = hoverData?.tokenPrice ?? activePrice ?? latestToken;
    const b =
      hoverData?.benchmarkPrice ??
      benchmarkData[benchmarkData.length - 1]?.value;
    if (!t || !b) return null;
    return ((t - b) / b) * 100;
  }, [hoverData, activePrice, latestToken, benchmarkData]);

  // Display price and change
  const displayedPrice = hoverData?.tokenPrice ?? activePrice ?? latestToken;
  const displayedChange =
    hoverData && hoverData.tokenPrice !== undefined && tokenData[0]?.value
      ? ((hoverData.tokenPrice - tokenData[0].value) / tokenData[0].value) * 100
      : priceChangePct;

  return (
    <div className={styles.container} data-token-contract={contract}>
      <div className={styles.topBar}>
        <div className={styles.priceDisplay}>
          <span className={styles.currentPrice}>
            {displayedPrice !== undefined ? money(displayedPrice) : "—"}
          </span>
          <span
            className={`${styles.priceChange} ${displayedChange === undefined || displayedChange >= 0 ? styles.up : styles.down}`}
          >
            {displayedChange !== undefined ? pct(displayedChange) : "—"}
          </span>
          <span className={styles.liveIndicator}>OBSERVED</span>
        </div>
        <div className={styles.timeframeGroup}>
          {(["1h", "1d", "1w"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              className={`${styles.timeframeBtn} ${timeframe === tf ? styles.active : ""}`}
              onClick={() => {
                setTimeframe(tf);
                onTimeframeChange?.(tf);
              }}
              title={`Switch to ${tf.toUpperCase()} timeframe`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chartViewport}>
        {hoverData && (
          <div className={styles.tooltipHUD}>
            <span className={styles.tooltipTime}>{hoverData.timeStr}</span>
            <div className={styles.tooltipRow}>
              <span className={styles.tooltipDotToken} />
              <span>
                {tokenName ?? ticker ?? "RWA Token"}:{" "}
                <strong>
                  {hoverData.tokenPrice !== undefined
                    ? money(hoverData.tokenPrice)
                    : "—"}
                </strong>
              </span>
            </div>
            {compare && hoverData.benchmarkPrice !== undefined && (
              <div className={styles.tooltipRow}>
                <span className={styles.tooltipDotBenchmark} />
                <span>
                  {benchmarkName}:{" "}
                  <strong>{money(hoverData.benchmarkPrice)}</strong>
                </span>
                {currentSpread !== null && (
                  <span
                    className={`${styles.spreadTag} ${Math.abs(currentSpread) < 0.2 ? styles.tight : styles.wide}`}
                  >
                    Peg: {currentSpread >= 0 ? "+" : ""}
                    {currentSpread.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {tokenData.length > 0 || benchmarkData.length > 0 ? (
          <div ref={containerRef} className={styles.chartCanvas} />
        ) : (
          <div className={styles.emptyOverlay}>
            No observations available for this period.
          </div>
        )}
      </div>

      <div className={styles.bottomLegend}>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <span
              className={styles.legendDotToken}
              style={{ background: isPositive ? "#10b981" : "#f43f5e" }}
            />
            <span>{tokenName ?? `${ticker ?? "Asset"} Token`}</span>
          </div>
          {compare && benchmarkData.length > 0 && (
            <div className={styles.legendItem}>
              <span className={styles.legendDotBenchmark} />
              <span>{benchmarkName} (Underlying)</span>
            </div>
          )}
        </div>
        <div className={styles.scrollHint}>
          <span>← Drag to explore history →</span>
        </div>
      </div>
    </div>
  );
}
