import snapshot from "./sp100-snapshot.json" with { type: "json" };
import type { MainnetAsset } from "./mainnet";

export type ResearchCompany = {
  ticker: string;
  name: string;
  sector: string;
  companyId: string;
};
export type StockUniverse = {
  asOf: string;
  source: string;
  sourceUrl: string;
  sourcePage: string;
  companyCount: number;
  sha256: string;
  companies: ResearchCompany[];
  retrievalError?: string;
};
export const SP100_SNAPSHOT: StockUniverse = snapshot;
export const normalizeTicker = (ticker: string) =>
  ticker.toUpperCase().replace(/[.\s-]/g, "");
export const sameTicker = (a: string, b: string) =>
  normalizeTicker(a) === normalizeTicker(b);
export const PRIMARY_ISSUER = "bstock" as const;
export const PRICE_REFRESH_MS = 15_000;

/** Default discovery preference only. Every execution still requires a fresh quote. */
export function preferredIssuer(
  rows: MainnetAsset[],
): MainnetAsset | undefined {
  const rank = { bstock: 0, ondo: 1, xstocks: 2 };
  return [...rows].sort(
    (a, b) =>
      rank[a.platform] - rank[b.platform] || a.address.localeCompare(b.address),
  )[0];
}

export function stockCoverage(universe: StockUniverse, assets: MainnetAsset[]) {
  return universe.companies.map((company) => ({
    ...company,
    issuers: assets.filter(
      (asset) =>
        asset.chainId === 56 && sameTicker(asset.ticker, company.ticker),
    ),
  }));
}

/** Retrieval time never establishes when the provider's price last changed. */
export function priceFreshness(asset: MainnetAsset, now = Date.now()) {
  const price = Number(asset.priceUsd);
  if (!Number.isFinite(price) || price <= 0)
    return { status: "unavailable" as const, label: "Price unavailable" };
  const time = asset.priceUpdatedAt ? Date.parse(asset.priceUpdatedAt) : NaN;
  if (!Number.isFinite(time) || time > now + 5_000)
    return { status: "unknown" as const, label: "Price time unavailable" };
  const age = Math.max(0, now - time);
  if (age > 120_000)
    return { status: "stale" as const, label: "Stale observation" };
  return {
    status: "observed" as const,
    label: age <= 30_000 ? "Recent observation" : "Observed price",
  };
}

/** Strict CSV reader for quoted official holdings; only equity identities are retained. */
export function parseStockHoldings(csv: string): ResearchCompany[] {
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (quoted && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      record.push(field);
      field = "";
    } else if (ch === "\n" && !quoted) {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field || record.length) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  if (quoted) throw new Error("Incomplete holdings CSV.");
  const headerAt = records.findIndex(
    (row) => row[0] === "Ticker" && row.includes("Asset Class"),
  );
  if (headerAt < 0) throw new Error("Holdings header unavailable.");
  const header = records[headerAt];
  const at = (row: string[], name: string) =>
    row[header.indexOf(name)]?.trim() ?? "";
  const companies = records
    .slice(headerAt + 1)
    .filter((row) => at(row, "Asset Class") === "Equity")
    .map((row) => {
      const ticker = at(row, "Ticker").replace(/^BRK B$/, "BRK.B");
      return {
        ticker,
        name: at(row, "Name"),
        sector: at(row, "Sector"),
        companyId: ["GOOG", "GOOGL"].includes(ticker)
          ? "ALPHABET"
          : normalizeTicker(ticker),
      };
    });
  if (
    companies.some(
      (c) =>
        !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(c.ticker) || !c.name || !c.sector,
    ) ||
    new Set(companies.map((c) => c.ticker)).size !== companies.length ||
    new Set(companies.map((c) => c.companyId)).size !== 100
  )
    throw new Error("The holdings do not reconcile to 100 equity companies.");
  return companies;
}
