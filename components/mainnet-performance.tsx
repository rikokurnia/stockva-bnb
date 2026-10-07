"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { money } from "../lib/city";
import type { EquityPoint } from "../lib/equity-history";
import {
  bscTxLink,
  type EvmAddress,
  type MainnetReceipt,
  type WalletBalances,
} from "../lib/mainnet";
import { observedPrice } from "../lib/mainnet-research";
import EquityChart from "./equity-chart";
import styles from "./civic-panel.module.css";

type Props = {
  active: boolean;
  account: EvmAddress | null;
  balance: WalletBalances | null;
  readError?: string | null;
  receipts: MainnetReceipt[];
  onTrade?: (address: string, side: "buy" | "sell") => void;
};
type Snapshot = EquityPoint & {
  chainId: 56;
  account: EvmAddress;
  source: "wallet";
};
const keyFor = (account: EvmAddress | null) =>
  `stockva.mainnet.56.performance.${account?.toLowerCase() ?? "disconnected"}`;
const amountText = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 8 });
const signed = (value: number) => `${value > 0 ? "+" : ""}${money(value)}`;
const validRaw = (value: string | null | undefined) =>
  typeof value === "string" && /^\d+$/.test(value);

/** Local charts describe previously observed wallet values, never an authoritative balance. */
function readSnapshots(value: unknown, account: EvmAddress): Snapshot[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value
    .filter((point): point is Snapshot => {
      if (
        !point ||
        point.chainId !== 56 ||
        point.source !== "wallet" ||
        typeof point.account !== "string" ||
        point.account.toLowerCase() !== account.toLowerCase() ||
        !Number.isFinite(point.t) ||
        point.t <= 0 ||
        point.t > Date.now() ||
        !Number.isFinite(point.equity) ||
        point.equity < 0 ||
        seen.has(point.t)
      )
        return false;
      seen.add(point.t);
      return true;
    })
    .sort((a, b) => a.t - b.t)
    .slice(-400);
}

/** Compare recorded purchase cost only when units match; matching units never proves complete wallet history or cost basis. */
function recordedPurchaseCost(
  holding: WalletBalances["holdings"][number],
  receipts: MainnetReceipt[],
  account: EvmAddress,
): number | null {
  const matched = receipts.filter(
    (receipt) =>
      receipt.status === "FILLED" &&
      receipt.txHash &&
      receipt.asset.chainId === 56 &&
      receipt.account.toLowerCase() === account.toLowerCase() &&
      receipt.asset.address.toLowerCase() ===
        holding.asset.address.toLowerCase(),
  );
  if (matched.some((receipt) => receipt.side === "sell")) return null;
  const buys = [
    ...new Map(
      matched
        .filter((receipt) => receipt.side === "buy")
        .map((receipt) => [receipt.quoteId, receipt]),
    ).values(),
  ];
  if (
    !buys.length ||
    !validRaw(holding.raw) ||
    buys.some(
      (receipt) =>
        !validRaw(receipt.toAmount) ||
        receipt.fromFormatted === null ||
        !Number.isFinite(Number(receipt.fromFormatted)) ||
        Number(receipt.fromFormatted) <= 0,
    )
  )
    return null;
  const units = buys.reduce(
    (sum, receipt) => sum + BigInt(receipt.toAmount!),
    0n,
  );
  if (units !== BigInt(holding.raw)) return null;
  const basis = buys.reduce(
    (sum, receipt) => sum + Number(receipt.fromFormatted),
    0,
  );
  return Number.isFinite(basis) && basis > 0 ? basis : null;
}

export default function MainnetPerformance({
  active,
  account,
  balance,
  readError,
  receipts,
  onTrade,
}: Props) {
  const accountKey = account?.toLowerCase() ?? "";
  const wallet =
    account &&
    balance?.chainId === 56 &&
    balance.account.toLowerCase() === accountKey
      ? balance
      : null;
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const storageKey = keyFor(account);
  const positions = useMemo(
    () =>
      (wallet?.holdings ?? [])
        .filter((holding) => validRaw(holding.raw) && BigInt(holding.raw) > 0n)
        .map((holding) => {
          const price = observedPrice(holding.asset);
          const quantity = Number(holding.formatted);
          const value =
            price !== null && Number.isFinite(quantity)
              ? quantity * price
              : null;
          const basis = account
            ? recordedPurchaseCost(holding, receipts, account)
            : null;
          return {
            ...holding,
            quantity,
            price,
            value,
            basis,
            pnl: value !== null && basis !== null ? value - basis : null,
          };
        }),
    [wallet, receipts, account],
  );
  const completePrices = positions.every(
    (position) => position.value !== null && Number.isFinite(position.value),
  );
  const stockValue = positions.reduce(
    (sum, position) => sum + (position.value ?? 0),
    0,
  );
  const cash = wallet ? Number(wallet.usdt.formatted) : null;
  const equity =
    wallet &&
    completePrices &&
    cash !== null &&
    Number.isFinite(cash) &&
    cash >= 0
      ? stockValue + cash
      : null;
  const completeBasis = positions.every((position) => position.pnl !== null);
  const unrealized =
    wallet && completePrices && completeBasis
      ? positions.reduce((sum, position) => sum + (position.pnl ?? 0), 0)
      : null;
  const sales = receipts
    .filter(
      (receipt) =>
        receipt.status === "FILLED" &&
        receipt.side === "sell" &&
        receipt.txHash &&
        receipt.asset.chainId === 56 &&
        receipt.account.toLowerCase() === accountKey,
    )
    .sort(
      (a, b) =>
        Date.parse(b.filledAt ?? b.createdAt) -
        Date.parse(a.filledAt ?? a.createdAt),
    );
  const pending = receipts.some(
    (receipt) =>
      receipt.status === "PENDING" &&
      receipt.account.toLowerCase() === accountKey,
  );

  useEffect(() => {
    let saved: Snapshot[] = [];
    if (account)
      try {
        saved = readSnapshots(
          JSON.parse(localStorage.getItem(storageKey) ?? "[]"),
          account,
        );
      } catch {
        /* Corrupt or unavailable chart storage starts empty. */
      }
    setSnapshots(saved);
    setLoadedKey(storageKey);
  }, [account, storageKey]);
  useEffect(() => {
    if (
      !account ||
      !wallet ||
      readError ||
      loadedKey !== storageKey ||
      equity === null ||
      !Number.isFinite(equity)
    )
      return;
    const t = Date.parse(wallet.fetchedAt);
    if (!Number.isFinite(t) || t <= 0 || t > Date.now()) return;
    setSnapshots((previous) => {
      const latest = previous.at(-1);
      if (latest && (t <= latest.t || t - latest.t < 60_000)) return previous;
      const next = [
        ...previous,
        { t, equity, chainId: 56 as const, account, source: "wallet" as const },
      ].slice(-400);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* Chart persistence is optional and never changes funds. */
      }
      return next;
    });
  }, [account, wallet, readError, equity, loadedKey, storageKey]);

  const points = loadedKey === storageKey ? snapshots : [];
  const byDay = new Map<string, Snapshot>();
  for (const point of points)
    byDay.set(new Date(point.t).toDateString(), point);
  const days = [...byDay.values()];
  const deltas = days
    .slice(1)
    .map((point, index) => ({
      point,
      change: point.equity - days[index].equity,
      percent:
        days[index].equity > 0
          ? ((point.equity - days[index].equity) / days[index].equity) * 100
          : null,
    }))
    .slice(-30)
    .reverse();
  const maxPnl = Math.max(
    1,
    ...positions.map((position) => Math.abs(position.pnl ?? 0)),
  );
  if (!active) return null;
  return (
    <>
      <div className={styles.summaryStrip}>
        <div>
          <span>Total wallet value</span>
          <strong>{equity === null ? "—" : money(equity)}</strong>
          <small>Stock tokens + USDT · BNB gas balance excluded</small>
        </div>
        <div>
          <span>Value vs recorded purchases</span>
          <strong
            className={
              unrealized === null
                ? ""
                : unrealized < 0
                  ? styles.loss
                  : styles.gain
            }
          >
            {unrealized === null ? "—" : signed(unrealized)}
          </strong>
          <small>
            {unrealized === null
              ? "Comparable recorded purchases unavailable"
              : "Recorded purchase-cost comparison; not investment profit"}
          </small>
        </div>
        <div>
          <span>Complete wallet history</span>
          <strong>Unavailable</strong>
          <small>Transfers and outside trades are not fully reconciled</small>
        </div>
      </div>
      <section className={styles.section} aria-label="Sale history">
        <div className={styles.sectionHeading}>
          <h4>Sale history</h4>
          <span>
            {sales.length} confirmed {sales.length === 1 ? "sale" : "sales"}
          </span>
        </div>
        {sales.length ? (
          <div className={styles.perfTableWrap}>
            <table className={styles.perfTable}>
              <thead>
                <tr>
                  <th>Token</th>
                  <th className={styles.num}>Qty</th>
                  <th className={styles.num}>USDT proceeds</th>
                  <th className={styles.num}>Verified profit</th>
                  <th>Date</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 30).map((sale) => (
                  <tr key={sale.quoteId}>
                    <td>
                      <strong>{sale.asset.symbol}</strong>
                      <small style={{ display: "block" }}>
                        {sale.asset.platform}
                      </small>
                    </td>
                    <td className={styles.num}>{sale.fromFormatted ?? "—"}</td>
                    <td className={styles.num}>{sale.toFormatted ?? "—"}</td>
                    <td className={styles.num}>—</td>
                    <td>
                      {new Date(
                        sale.filledAt ?? sale.createdAt,
                      ).toLocaleString()}
                    </td>
                    <td>
                      <a
                        href={bscTxLink(sale.txHash!)}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.textLink}
                      >
                        <code>
                          {sale.txHash!.slice(0, 8)}…{sale.txHash!.slice(-6)}
                        </code>
                        <ExternalLink size={13} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.caption}>
            Confirmed stock-token sales made in Stockva appear here with their
            settlement receipts.
          </p>
        )}
      </section>
      <section className={styles.section} aria-label="Wallet value curve">
        <div className={styles.sectionHeading}>
          <h4>Total Wallet Value</h4>
          <span>Actual observed snapshots</span>
        </div>
        {points.length >= 2 ? (
          <EquityChart points={points} />
        ) : (
          <div className={styles.empty}>
            <h4>Your equity curve starts here.</h4>
            <p>
              Two complete wallet observations are needed. City Hall records a
              snapshot at most once per minute while open; missing prices leave
              a gap.
            </p>
          </div>
        )}
        <p className={styles.caption}>
          This chart records stock-token observations plus the USDT wallet
          balance for this wallet on BSC. Deposits, withdrawals and price
          changes can all move the value; it is not a cash-flow-adjusted
          investment return. No historical observations are invented.
        </p>
      </section>
      <section
        className={styles.section}
        aria-label="Recorded purchase comparisons"
      >
        <div className={styles.sectionHeading}>
          <h4>Recorded purchase comparisons</h4>
          <span>Observed value minus recorded purchase cost</span>
        </div>
        {positions.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...positions]
              .sort((a, b) => (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity))
              .map((position) => (
                <div
                  key={position.asset.address}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <strong>{position.asset.symbol}</strong>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 5,
                      background: "rgba(8, 16, 22, 0.6)",
                      border: "1px solid var(--line-subtle)",
                      overflow: "hidden",
                    }}
                  >
                    {position.pnl !== null && (
                      <div
                        style={{
                          height: "100%",
                          width: `${(Math.abs(position.pnl) / maxPnl) * 100}%`,
                          background: position.pnl < 0 ? "#f43f5e" : "#10b981",
                          borderRadius: "inherit",
                        }}
                      />
                    )}
                  </div>
                  <span
                    className={
                      position.pnl === null
                        ? ""
                        : position.pnl < 0
                          ? styles.loss
                          : styles.gain
                    }
                    style={{
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 90,
                      textAlign: "right",
                    }}
                  >
                    {position.pnl === null
                      ? "Unavailable"
                      : signed(position.pnl)}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <p className={styles.caption}>
            {wallet
              ? "No stock-token holdings yet."
              : "Refresh your wallet to load its holdings."}
          </p>
        )}
        <p className={styles.caption}>
          This compares observed token value with purchases recorded by Stockva,
          not verified cost basis or investment profit. Equal token quantities
          do not prove complete wallet history: transfers and outside trades may
          have changed your holdings. Gas fees are excluded.
        </p>
      </section>
      <section className={styles.section} aria-label="Daily wallet changes">
        <div className={styles.sectionHeading}>
          <h4>Daily performance</h4>
          <span>Day-over-day observed wallet value</span>
        </div>
        {deltas.length ? (
          <div className={styles.perfTableWrap}>
            <table className={styles.perfTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className={styles.num}>Wallet value</th>
                  <th className={styles.num}>Change</th>
                </tr>
              </thead>
              <tbody>
                {deltas.map(({ point, change, percent }) => (
                  <tr key={point.t}>
                    <td>{new Date(point.t).toLocaleDateString()}</td>
                    <td className={styles.num}>{money(point.equity)}</td>
                    <td
                      className={`${styles.num} ${change < 0 ? styles.loss : styles.gain}`}
                    >
                      {signed(change)}
                      {percent !== null
                        ? ` (${percent > 0 ? "+" : ""}${percent.toFixed(2)}%)`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.caption}>
            Daily rows appear after complete wallet observations on two
            different days.
          </p>
        )}
        <p className={styles.caption}>
          Wallet value changes include transfers and are not verified realized
          or unrealized profit.
        </p>
      </section>
      <section className={styles.section} aria-label="All positions">
        <div className={styles.sectionHeading}>
          <h4>All positions</h4>
          <span>
            {positions.length} issuer{" "}
            {positions.length === 1 ? "token" : "tokens"}
          </span>
        </div>
        {positions.length ? (
          <div className={styles.perfTableWrap}>
            <table className={styles.perfTable}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className={styles.num}>Units</th>
                  <th className={styles.num}>Avg recorded buy</th>
                  <th className={styles.num}>Observed price</th>
                  <th className={styles.num}>Recorded purchases</th>
                  <th className={styles.num}>Market value</th>
                  <th className={styles.num}>Value difference</th>
                  <th className={styles.num}>Difference %</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position.asset.address}>
                    <td>
                      <strong>{position.asset.symbol}</strong>
                      <small style={{ display: "block" }}>
                        {position.asset.platform}
                      </small>
                    </td>
                    <td className={styles.num}>
                      {amountText(position.quantity)}
                    </td>
                    <td className={styles.num}>
                      {position.basis !== null && position.quantity > 0
                        ? money(position.basis / position.quantity)
                        : "—"}
                    </td>
                    <td className={styles.num}>
                      {position.price === null ? "—" : money(position.price)}
                    </td>
                    <td className={styles.num}>
                      {position.basis === null ? "—" : money(position.basis)}
                    </td>
                    <td className={styles.num}>
                      {position.value === null ? "—" : money(position.value)}
                    </td>
                    <td
                      className={`${styles.num} ${position.pnl === null ? "" : position.pnl < 0 ? styles.loss : styles.gain}`}
                    >
                      {position.pnl === null ? "—" : signed(position.pnl)}
                    </td>
                    <td className={styles.num}>
                      {position.pnl !== null && position.basis !== null
                        ? `${position.pnl > 0 ? "+" : ""}${((position.pnl / position.basis) * 100).toFixed(2)}%`
                        : "—"}
                    </td>
                    <td>
                      {onTrade && (
                        <button
                          type="button"
                          className={styles.miniBtn}
                          disabled={pending || !wallet}
                          onClick={() =>
                            onTrade(position.asset.address, "sell")
                          }
                        >
                          Sell
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.caption}>
            Confirmed wallet holdings appear here.
          </p>
        )}
        <p className={styles.caption}>
          Selling opens a fresh quote and wallet review. Sale proceeds settle in
          USDT directly to your wallet.
        </p>
      </section>
    </>
  );
}
