import { SP100_SNAPSHOT, sameTicker } from "./stock-universe.ts";
import { assets as companyCatalogue } from "./city.ts";
import type { MainnetAsset, WalletBalances } from "./mainnet.ts";

/** Static company descriptions never supply token prices or holdings. */
export function companyMetadata(asset: MainnetAsset) {
  const company =
    SP100_SNAPSHOT.companies.find((item) =>
      sameTicker(item.ticker, asset.ticker),
    ) ?? companyCatalogue.find((item) => item.ticker === asset.ticker);
  return {
    name: company?.name ?? asset.name,
    sector: company?.sector ?? "Other assets",
  };
}

export function walletHolding(
  balance: WalletBalances | null,
  asset: MainnetAsset,
) {
  return balance?.chainId === 56
    ? balance.holdings.find(
        (holding) =>
          holding.asset.address.toLowerCase() === asset.address.toLowerCase(),
      )
    : undefined;
}

export function observedPrice(asset: MainnetAsset): number | null {
  const price = Number(asset.priceUsd);
  return asset.priceUsd !== null && Number.isFinite(price) && price > 0
    ? price
    : null;
}

/** Issuer endpoints must always receive the actual selected token contract. */
export function assetResearchUrl(path: string, asset: MainnetAsset) {
  return `${path}?ticker=${encodeURIComponent(asset.ticker)}&contract=${encodeURIComponent(asset.address)}`;
}
