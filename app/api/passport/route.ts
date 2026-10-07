import { NextRequest, NextResponse } from "next/server";
import { assets } from "../../../lib/city";
import type { Passport } from "../../../lib/market";
import { listMainnetAssets } from "../../../lib/trading-server";
import { selectMainnetAsset } from "../../../lib/market-observations";
import { rwaCompany } from "../../../lib/rwa-server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker") ?? "";
  const contract = request.nextUrl.searchParams.get("contract");
  if (!assets.some((asset) => asset.ticker === ticker))
    return NextResponse.json({ error: "Unknown asset" }, { status: 400 });
  if (contract && !/^0x[0-9a-fA-F]{40}$/.test(contract))
    return NextResponse.json(
      { error: "Invalid token contract" },
      { status: 400 },
    );
  const result: Passport = {
    fetchedAt: new Date().toISOString(),
    deployments: [],
  };
  try {
    const selected = selectMainnetAsset(
      await listMainnetAssets(),
      ticker,
      contract,
    );
    if (!selected) {
      result.error =
        "No supported BSC issuer contract matches this asset. An address is never inferred from a ticker.";
      return NextResponse.json(result);
    }
    result.name = selected.name;
    result.symbol = selected.symbol;
    result.platform = selected.platform;
    result.chainId = 56;
    result.contract = selected.address;
    result.deployments = [
      {
        network: "BinanceSmartChain",
        address: selected.address,
        explorer: `https://bscscan.com/token/${selected.address}`,
      },
    ];
    if (selected.logoUrl) result.logo = selected.logoUrl;
    const company = await rwaCompany(ticker, selected.address).catch(
      () => null,
    );
    if (company?.attestations?.length)
      result.attestations = company.attestations;
    // xStocks reserve records describe xStocks only, never Ondo or BStocks.
    if (selected.platform === "xstocks") {
      const response = await fetch(
        `https://api.xstocks.fi/api/v2/public/proof-of-reserves/${encodeURIComponent(selected.symbol)}`,
        {
          signal: AbortSignal.timeout(8_000),
          next: { revalidate: 300 },
        },
      );
      if (response.ok) {
        const data = await response.json();
        const held = Number(data.sharesHeld),
          supply = Number(data.circulatingSupply);
        if (
          data.symbol === selected.symbol &&
          Number.isFinite(held) &&
          held >= 0 &&
          Number.isFinite(supply) &&
          supply > 0 &&
          Number.isFinite(Date.parse(data.timestamp))
        )
          result.reserve = {
            timestamp: data.timestamp,
            sharesHeld: held,
            circulatingSupply: supply,
            providers: Array.isArray(data.holdings)
              ? [
                  ...new Set<string>(
                    data.holdings
                      .map(
                        (holding: { provider?: unknown }) => holding.provider,
                      )
                      .filter(
                        (provider: unknown): provider is string =>
                          typeof provider === "string",
                      ),
                  ),
                ]
              : [],
          };
      }
    }
  } catch {
    result.error = result.contract
      ? "Issuer contract verified; reserve details could not be refreshed."
      : "Issuer metadata is unavailable. No contract or reserve values are substituted.";
  }
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
