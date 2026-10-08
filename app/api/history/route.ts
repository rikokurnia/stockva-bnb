import { NextRequest, NextResponse } from "next/server";
import { getStockUniverse } from "../../../lib/stock-universe-server";
import { sameTicker } from "../../../lib/stock-universe";
import { type HistoryFeed, type PricePoint } from "../../../lib/market";
import { listMainnetAssets } from "../../../lib/trading-server";
import { binanceRequest } from "../../../lib/binance-web3";
import {
  CANDLE_LIMIT,
  HISTORY_PERIODS,
  type HistoryPeriod,
  parseBscCandles,
  selectMainnetAsset,
} from "../../../lib/market-observations";

export const runtime = "nodejs";
const ranges = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y"]);
const intervals = new Set(["2m", "5m", "15m", "30m", "60m", "1d"]);

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker") ?? "";
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker))
    return NextResponse.json({ error: "Unknown asset" }, { status: 400 });
  const contract = request.nextUrl.searchParams.get("contract");
  if (contract && !/^0x[0-9a-fA-F]{40}$/.test(contract))
    return NextResponse.json(
      { error: "Invalid token contract" },
      { status: 400 },
    );
  const period = request.nextUrl.searchParams.get("period") ?? "1d";
  if (!Object.hasOwn(HISTORY_PERIODS, period))
    return NextResponse.json(
      { error: "Unsupported history period" },
      { status: 400 },
    );
  const settings = HISTORY_PERIODS[period as HistoryPeriod];
  const range = request.nextUrl.searchParams.get("range") ?? settings.range;
  const interval =
    request.nextUrl.searchParams.get("interval") ?? settings.interval;
  if (!ranges.has(range) || !intervals.has(interval))
    return NextResponse.json(
      { error: "Unsupported history period" },
      { status: 400 },
    );
  const [universe, catalogueResult] = await Promise.all([
    getStockUniverse(),
    listMainnetAssets()
      .then((rows) => ({ rows, error: undefined as string | undefined }))
      .catch((error) => ({
        rows: [],
        error:
          error instanceof Error
            ? error.message
            : "Issuer catalogue unavailable",
      })),
  ]);
  const selected = selectMainnetAsset(catalogueResult.rows, ticker, contract);
  const catalogueError = catalogueResult.error;
  if (
    !universe.companies.some((company) => sameTicker(company.ticker, ticker)) &&
    !selected
  )
    return NextResponse.json({ error: "Unknown asset" }, { status: 400 });
  const output: HistoryFeed = {
    points: [],
    simulated: false,
    fetchedAt: new Date().toISOString(),
    tokenSource: "BSC token history unavailable",
    benchmarkSource: "Underlying reference unavailable",
  };
  const points = new Map<number, PricePoint>();
  const [token, stock] = await Promise.allSettled([
    (async () => {
      const asset = selected;
      if (!asset)
        throw new Error(
          catalogueError ??
            "No verified BSC issuer contract matches this selection.",
        );
      const bar = settings.bar;
      const rowsOfCandles = await binanceRequest<unknown>(
        "/api/v1/dex/market/candles",
        {
          binanceChainId: "56",
          tokenContractAddress: asset.address,
          bar,
          limit: CANDLE_LIMIT,
        },
      );
      return { asset, observations: parseBscCandles(rowsOfCandles) };
    })(),
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
  if (token.status === "rejected")
    output.tokenError = String(
      token.reason?.message ?? "BSC candle service unavailable",
    );
  else if (!token.value?.observations.length)
    output.tokenError = "No token candles were returned for this period.";
  if (stock.status === "rejected")
    output.benchmarkError = "Underlying reference service unavailable.";
  if (stock.status === "fulfilled") {
    const result = stock.value?.chart?.result?.[0];
    const price = Number(result?.meta?.regularMarketPrice);
    const time = Number(result?.meta?.regularMarketTime);
    if (
      Number.isFinite(price) &&
      price > 0 &&
      Number.isFinite(time) &&
      time > 0 &&
      time * 1000 <= Date.now() + 5000
    ) {
      output.benchmarkPrice = price;
      output.benchmarkAt = new Date(time * 1000).toISOString();
      output.benchmarkSource = "Yahoo Finance · delayed underlying reference";
      output.exchange = result.meta.exchangeName;
      result.timestamp?.forEach((at: number, index: number) => {
        const close = result.indicators?.quote?.[0]?.close?.[index];
        if (
          Number.isFinite(at) &&
          at > 0 &&
          at * 1000 <= Date.now() + 5000 &&
          typeof close === "number" &&
          Number.isFinite(close) &&
          close > 0
        ) {
          const key = at * 1000;
          const quote = result.indicators?.quote?.[0];
          const open = quote?.open?.[index];
          const volume = quote?.volume?.[index];
          points.set(key, {
            ...points.get(key),
            time: key,
            benchmark: close,
            benchmarkOpen:
              typeof open === "number" && Number.isFinite(open) && open > 0
                ? open
                : undefined,
            benchmarkVolume:
              typeof volume === "number" &&
              Number.isFinite(volume) &&
              volume >= 0
                ? volume
                : undefined,
          });
        }
      });
    }
  }
  if (![...points.values()].some((point) => point.benchmark !== undefined))
    output.benchmarkError ??=
      "No underlying observations were returned for this period.";
  output.points = [...points.values()].sort((a, b) => a.time - b.time);
  if (!output.points.some((point) => point.token !== undefined))
    output.error = `No observed BSC token history is available. ${output.tokenError ?? "Underlying references are separate research data."}`;
  return NextResponse.json(output, {
    headers: { "Cache-Control": "no-store" },
  });
}
