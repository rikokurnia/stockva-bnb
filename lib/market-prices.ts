import type { MainnetAsset } from "./mainnet";

/** Match price observations by BSC contract; reject invalid/future provider times. */
export function applyPriceObservations(
  assets: MainnetAsset[],
  raw: unknown,
  now = Date.now(),
): MainnetAsset[] {
  const prices = new Map<string, { price: string; at: string }>();
  for (const value of Array.isArray(raw) ? raw : []) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const price = Number(row.price),
      time = Number(row.time);
    if (
      String(row.binanceChainId) !== "56" ||
      typeof row.tokenContractAddress !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(row.tokenContractAddress) ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(time) ||
      time < 1e12 ||
      time > now + 5000
    )
      continue;
    const key = row.tokenContractAddress.toLowerCase();
    const previous = prices.get(key);
    if (!previous || Date.parse(previous.at) < time)
      prices.set(key, {
        price: String(row.price),
        at: new Date(time).toISOString(),
      });
  }
  return assets.map((asset) => {
    const observation = prices.get(asset.address.toLowerCase());
    return observation
      ? {
          ...asset,
          priceUsd: observation.price,
          priceUpdatedAt: observation.at,
          priceSource: "market" as const,
          priceError: undefined,
        }
      : { ...asset, priceError: "No valid market price observation returned." };
  });
}
