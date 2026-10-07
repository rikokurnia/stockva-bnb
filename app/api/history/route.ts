import { NextRequest, NextResponse } from "next/server";
import { assets } from "../../../lib/city";
import { type HistoryFeed, type PricePoint } from "../../../lib/market";
import { listMainnetAssets } from "../../../lib/trading-server";
import { binanceRequest } from "../../../lib/binance-web3";
import {
  parseBscCandles,
  selectMainnetAsset,
} from "../../../lib/market-observations";

export const runtime = "nodejs";
const ranges = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y"]);
const intervals = new Set(["2m", "5m", "15m", "30m", "60m", "1d"]);

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker") ?? "";
  if (!assets.some((asset) => asset.ticker === ticker))
    return NextResponse.json({ error: "Unknown asset" }, { status: 400 });
  const contract = request.nextUrl.searchParams.get("contract");
  if (contract && !/^0x[0-9a-fA-F]{40}$/.test(contract))
    return NextResponse.json(
      { error: "Invalid token contract" },
      { status: 400 },
    );
  const range = request.nextUrl.searchParams.get("range") ?? "1mo";
  const interval = request.nextUrl.searchParams.get("interval") ?? "15m";
  if (!ranges.has(range) || !intervals.has(interval))
    return NextResponse.json(
      { error: "Unsupported history period" },
      { status: 400 },
    );
  const output: HistoryFeed = {
    points: [],
    simulated: false,
    tokenSource: "BSC token history unavailable",
    benchmarkSource: "Underlying reference unavailable",
  };
  const points = new Map<number, PricePoint>();
  const [token, stock] = await Promise.allSettled([
    listMainnetAssets().then(async (rows) => {
      const asset = selectMainnetAsset(rows, ticker, contract);
      if (!asset) return null;
      const bar =
        range === "1d"
          ? "5m"
          : range === "5d"
            ? "15m"
            : range === "1mo"
              ? "1h"
              : "1d";
      const rowsOfCandles = await binanceRequest<unknown>(
        "/api/v1/dex/market/candles",
        {
          binanceChainId: "56",
          tokenContractAddress: asset.address,
          bar,
          limit: "500",
        },
      );
      return { asset, observations: parseBscCandles(rowsOfCandles) };
    }),
    fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.replace(".", "-"))}?interval=${interval}&range=${range}`,
      {
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 60 },
      },
    ).then(async (response) => {
      if (!response.ok) throw new Error("Underlying reference unavailable");
      return response.json();
    }),
  ]);
  if (token.status === "fulfilled" && token.value) {
    const { asset, observations } = token.value;
    for (const point of observations) points.set(point.time, point);
    output.contract = asset.address;
    output.chainId = 56;
    if (observations.length) {
      output.tokenSource = `Binance Web3 · BSC ${asset.symbol} candle closes`;
      output.tokenAt = new Date(observations.at(-1)!.time).toISOString();
    }
  }
  if (stock.status === "fulfilled") {
    const result = stock.value?.chart?.result?.[0];
    const price = Number(result?.meta?.regularMarketPrice);
    const time = Number(result?.meta?.regularMarketTime);
    if (
      Number.isFinite(price) &&
      price > 0 &&
      Number.isFinite(time) &&
      time > 0
    ) {
      output.benchmarkPrice = price;
      output.benchmarkAt = new Date(time * 1000).toISOString();
      output.benchmarkSource = "Yahoo Finance · delayed underlying reference";
      output.exchange = result.meta.exchangeName;
      result.timestamp?.forEach((at: number, index: number) => {
        const close = result.indicators?.quote?.[0]?.close?.[index];
        if (
          Number.isFinite(at) &&
          typeof close === "number" &&
          Number.isFinite(close) &&
          close > 0
        ) {
          const key = at * 1000;
          points.set(key, { ...points.get(key), time: key, benchmark: close });
        }
      });
    }
  }
  output.points = [...points.values()].sort((a, b) => a.time - b.time);
  if (!output.points.some((point) => point.token !== undefined))
    output.error =
      "No observed BSC token history is available. Underlying references are separate research data.";
  return NextResponse.json(output, {
    headers: { "Cache-Control": "no-store" },
  });
}
