import {
  catalogue,
  defFor,
  footprint,
  placementError,
  validCell,
  type Building,
  type Cell,
  type CityState,
} from "./city.ts";
import type { EvmAddress, MainnetReceipt, WalletBalances } from "./mainnet.ts";

export const layoutKey = (account: EvmAddress | null) =>
  `stockva.mainnet.56.layout.${account?.toLowerCase() ?? "visitor"}`;
export const receiptKey = (account: EvmAddress) =>
  `stockva.mainnet.56.orders.${account.toLowerCase()}`;

/** A broadcast in another tab must be reconciled before a new reviewed trade starts. */
export function unresolvedWalletTrade(
  value: unknown,
  account: EvmAddress,
  quoteId: string,
): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (r) =>
        r &&
        typeof r.account === "string" &&
        r.account.toLowerCase() === account.toLowerCase() &&
        r.asset?.chainId === 56 &&
        r.quoteId !== quoteId &&
        r.status === "PENDING" &&
        ((typeof r.txHash === "string" &&
          /^0x[0-9a-fA-F]{64}$/.test(r.txHash)) ||
          (typeof r.orderId === "string" && r.orderId.length > 0)),
    )
  );
}

/** Local receipts are discovery hints; only the server can confirm a fill. */
export function readReceiptHints(
  value: unknown,
  account: EvmAddress,
): MainnetReceipt[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r) =>
        r &&
        typeof r.account === "string" &&
        r.account.toLowerCase() === account.toLowerCase() &&
        typeof r.quoteId === "string" &&
        r.asset?.chainId === 56 &&
        typeof r.asset.address === "string" &&
        /^0x[0-9a-fA-F]{40}$/.test(r.asset.address) &&
        typeof r.asset.symbol === "string" &&
        typeof r.asset.ticker === "string" &&
        typeof r.asset.name === "string" &&
        typeof r.recoveryToken === "string",
    )
    .slice(-100)
    .map((r) => ({
      ...r,
      status: "PENDING",
      error: "Checking stored order against mainnet…",
    }));
}

/** Persist against the signing account even if the UI has switched wallets. */
export function persistReceiptHint(
  storage: Pick<Storage, "getItem" | "setItem">,
  receipt: MainnetReceipt,
) {
  const key = receiptKey(receipt.account);
  let saved: unknown = [];
  try {
    saved = JSON.parse(storage.getItem(key) ?? "[]");
  } catch {
    /* Replace corrupt hints. */
  }
  storage.setItem(
    key,
    JSON.stringify(
      mergeReceipt(readReceiptHints(saved, receipt.account), receipt),
    ),
  );
}
export type MainnetLayout = {
  chainId: 56;
  roads: Cell[];
  buildings: Building[];
};
export const emptyLayout = (): MainnetLayout => ({
  chainId: 56,
  roads: [],
  buildings: [],
});

/** Persistence contains layout only. Balances and quantities always come from RPC. */
export function readLayout(
  value: unknown,
  account: EvmAddress | null,
): MainnetLayout {
  if (
    !value ||
    typeof value !== "object" ||
    (value as MainnetLayout).chainId !== 56
  )
    return emptyLayout();
  const source = value as MainnetLayout;
  const roads = Array.isArray(source.roads)
    ? source.roads
        .filter((c) => c && typeof c === "object" && validCell(c))
        .slice(0, 600)
    : [];
  const buildings: Building[] = [];
  for (const row of Array.isArray(source.buildings)
    ? source.buildings.slice(0, 120)
    : []) {
    if (
      !row ||
      !catalogue.some((d) => d.kind === row.kind) ||
      !footprint(row).every(validCell)
    )
      continue;
    const def = defFor(row.kind);
    if (buildings.some((b) => b.kind === row.kind)) continue;
    if (
      def.ticker &&
      (!account ||
        !/^0x[0-9a-fA-F]{40}$/.test(row.tokenAddress ?? "") ||
        row.owner?.toLowerCase() !== account.toLowerCase())
    )
      continue;
    const candidate: Building = {
      id: String(row.id).slice(0, 80),
      kind: row.kind,
      r: row.r,
      c: row.c,
      builtAt: Number.isFinite(row.builtAt) ? row.builtAt : 0,
      cost: 0,
      entry: 0,
      quantity: 0,
      ...(def.ticker
        ? { tokenAddress: row.tokenAddress, owner: account! }
        : {}),
    };
    const state: CityState = { version: 2, cash: 0, roads, buildings };
    if (!placementError(candidate, state)) buildings.push(candidate);
  }
  return { chainId: 56, roads, buildings };
}

export function serializeLayout(layout: MainnetLayout): MainnetLayout {
  return {
    chainId: 56,
    roads: layout.roads,
    buildings: layout.buildings.map((b) => ({
      ...b,
      quantity: 0,
      cost: 0,
      entry: 0,
      vaultId: undefined,
      vaultTx: undefined,
    })),
  };
}

export function representedCity(
  layout: MainnetLayout,
  balances: WalletBalances | null,
  receipts: MainnetReceipt[] = [],
): CityState {
  const holdings = new Map(
    balances?.holdings.map((h) => [h.asset.address.toLowerCase(), h]) ?? [],
  );
  const represented = new Set<string>();
  const representedKinds = new Set<string>();
  const buildings = layout.buildings.map((b) => {
    if (!defFor(b.kind).ticker)
      return { ...b, quantity: 0, cost: 0, entry: 0, locked: false };
    const holding = holdings.get(b.tokenAddress?.toLowerCase() ?? "");
    const key = b.tokenAddress?.toLowerCase() ?? "";
    if (
      !holding ||
      holding.asset.ticker !== defFor(b.kind).ticker ||
      represented.has(key) ||
      representedKinds.has(b.kind) ||
      b.owner?.toLowerCase() !== balances?.account.toLowerCase()
    )
      return { ...b, quantity: 0, entry: 0, cost: 0, locked: true };
    represented.add(key);
    representedKinds.add(b.kind);
    const buys = receipts.filter(
      (r) =>
        r.status === "FILLED" &&
        r.account.toLowerCase() === balances!.account.toLowerCase() &&
        r.side === "buy" &&
        r.asset.address.toLowerCase() === key &&
        r.txHash,
    );
    // An entry price is shown only for a holding whose full current quantity can be reconciled to these receipts.
    const receiptQuantity = buys.reduce(
      (n, r) => n + Number(r.toFormatted ?? 0),
      0,
    );
    const receiptCost = buys.reduce(
      (n, r) => n + Number(r.fromFormatted ?? 0),
      0,
    );
    const quantity = Number(holding.formatted);
    const hasSales = receipts.some(
      (r) =>
        r.status === "FILLED" &&
        r.side === "sell" &&
        r.asset.address.toLowerCase() === key,
    );
    const knownEntry =
      !hasSales &&
      receiptQuantity > 0 &&
      Math.abs(receiptQuantity - quantity) <= Math.max(1e-12, quantity * 1e-9);
    return {
      ...b,
      tokenDecimals: holding.asset.decimals,
      quantity,
      cost: knownEntry ? receiptCost : 0,
      entry: knownEntry ? receiptCost / receiptQuantity : 0,
      locked: quantity <= 0,
    };
  });
  return {
    version: 2,
    cash: Number(balances?.usdt.formatted ?? 0),
    buildings,
    roads: layout.roads,
  };
}

export function mergeReceipt(
  previous: MainnetReceipt[],
  next: MainnetReceipt,
): MainnetReceipt[] {
  return [...previous.filter((r) => r.quoteId !== next.quoteId), next].slice(
    -100,
  );
}
