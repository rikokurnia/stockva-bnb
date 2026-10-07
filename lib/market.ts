import { assets } from "./city";
import type { RwaSession, RwaSessionState } from "./rwa";
export type RwaQuoteDelta = {
  onchain: number;
  reference: number;
  /** (onchain - reference) / reference * 10000. Positive = on-chain premium. */
  spreadBps: number;
  onchainAt: string | null;
  session: RwaSessionState;
  referenceFrozen: boolean;
  platform: string;
  contract: string;
};
export type Quote = {
  ticker: string;
  price: number;
  change: number;
  changeAvailable?: boolean;
  source: string | null;
  status: "live" | "unavailable" | "stale" | "fallback";
  fetchedAt: string | null;
  pair?: string;
  tokenName?: string;
  contract?: string;
  chainId?: 56;
  platform?: string;
  /** Binance RWA Data on-chain vs reference spread (when the key is set). */
  rwa?: RwaQuoteDelta;
};
export type MarketFeed = {
  quotes: Record<string, Quote>;
  fetchedAt: string;
  /** Aggregate US-market session for the exchange clock. */
  marketSession?: RwaSession;
  error?: string;
};
export type PricePoint = {
  time: number;
  token?: number;
  benchmark?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
};
export type HistoryFeed = {
  points: PricePoint[];
  benchmarkPrice?: number;
  benchmarkAt?: string;
  tokenAt?: string;
  tokenSource: string;
  benchmarkSource: string;
  simulated: boolean;
  contract?: string;
  chainId?: 56;
  error?: string;
  exchange?: string;
};
export function unavailableFeed(): MarketFeed {
  return {
    fetchedAt: new Date().toISOString(),
    quotes: Object.fromEntries(
      assets.map((a) => [
        a.ticker,
        {
          ticker: a.ticker,
          price: 0,
          change: 0,
          source: null,
          status: "unavailable",
          fetchedAt: null,
        },
      ]),
    ),
  };
}
/** Compatibility for the retired city renderer; never provides assumed prices. */
export const fallbackFeed = unavailableFeed;
export type Passport = {
  fetchedAt: string;
  name?: string;
  symbol?: string;
  logo?: string;
  isin?: string;
  platform?: string;
  chainId?: 56;
  contract?: string;
  attestations?: { label: string; url: string }[];
  exchange?: string;
  period?: string;
  nextChangeAt?: string;
  halted?: boolean;
  deployments: { network: string; address: string; explorer?: string }[];
  reserve?: {
    timestamp: string;
    sharesHeld: number;
    circulatingSupply: number;
    providers: string[];
  };
  error?: string;
};
