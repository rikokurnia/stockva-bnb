"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ExternalLink, RefreshCw, Wallet } from "lucide-react";
import {
  bscAddressLink,
  bscTxLink,
  USDT_ADDRESS,
  type MainnetReceipt,
  type WalletBalances,
} from "../lib/mainnet";
import { useMainnetWallet } from "./use-mainnet-wallet";
import { companyMetadata, observedPrice } from "../lib/mainnet-research";
import MainnetPerformance from "./mainnet-performance";
import StockLogo from "./stock-logo";
import styles from "./civic-panel.module.css";

export type MainnetCityHallProps = {
  walletAddress?: `0x${string}` | null;
  balance?: WalletBalances | null;
  balanceLoading?: boolean;
  balanceError?: string | null;
  receipts?: MainnetReceipt[];
  onConnectWallet?: () => void | Promise<`0x${string}`>;
  onFocusTicker?: (ticker: string) => void;
  onTrade?: (assetAddress: string, side: "buy" | "sell") => void;
  onRefresh?: () => void;
  onClose?: () => void;
  onBusy?: (busy: boolean) => void;
};

const usd = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
const units = (value: string, decimals = 8) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: decimals });
const time = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString();
};
const statusLabel: Record<MainnetReceipt["status"], string> = {
  PENDING: "Awaiting settlement",
  FILLED: "Confirmed",
  FAILED: "Failed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export default function CivicCityHall({
  walletAddress,
  balance: providedBalance,
  balanceLoading,
  balanceError,
  receipts = [],
  onConnectWallet,
  onFocusTicker,
  onTrade,
  onRefresh,
  onClose,
  onBusy,
}: MainnetCityHallProps) {
  const live = useMainnetWallet(
    providedBalance === undefined ? walletAddress : null,
  );
  const balance =
    providedBalance !== undefined ? providedBalance : live.balance;
  const matchingBalance =
    balance?.chainId === 56 &&
    balance.account.toLowerCase() === walletAddress?.toLowerCase()
      ? balance
      : null;
  const loading =
    providedBalance === undefined ? live.loading : Boolean(balanceLoading);
  const readError = providedBalance === undefined ? live.error : balanceError;
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hallView, setHallView] = useState<"holdings" | "performance">(
    "holdings",
  );
  useEffect(() => setHallView("holdings"), [walletAddress]);
  useEffect(() => {
    onBusy?.(connecting);
    return () => onBusy?.(false);
  }, [connecting, onBusy]);
  const holdings =
    matchingBalance?.holdings.filter((holding) => BigInt(holding.raw) > 0n) ??
    [];
  const pricedHoldings = holdings.filter(
    (holding) =>
      observedPrice(holding.asset) !== null &&
      Number.isFinite(Number(holding.formatted)),
  );
  const valued = pricedHoldings.reduce(
    (sum, holding) =>
      sum + Number(holding.formatted) * observedPrice(holding.asset)!,
    0,
  );
  const unpriced = holdings.length - pricedHoldings.length;
  const sectorValues = new Map<string, number>();
  for (const holding of holdings) {
    const sector = companyMetadata(holding.asset).sector;
    const value = Number(holding.formatted) * Number(holding.asset.priceUsd);
    sectorValues.set(
      sector,
      (sectorValues.get(sector) ?? 0) + (Number.isFinite(value) ? value : 0),
    );
  }
  const sectors = [...sectorValues.entries()].sort((a, b) => b[1] - a[1]);
  const history = receipts
    .filter(
      (receipt) =>
        receipt.account.toLowerCase() === walletAddress?.toLowerCase(),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const refresh = () => {
    live.refresh();
    onRefresh?.();
  };
  const connect = async () => {
    if (!onConnectWallet || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      await onConnectWallet();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not connect the wallet.",
      );
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className={styles.mainnetHall}>
      <div className={styles.intro}>
        <div>
          <h3>Your wallet, represented by your city.</h3>
          <p>
            Actual stock tokens and balances on BNB Smart Chain. Buildings
            visualize the assets held in your wallet.
          </p>
        </div>
        <button
          type="button"
          className={styles.secondary}
          onClick={refresh}
          disabled={loading || !walletAddress}
        >
          <RefreshCw size={15} />
          {loading ? "Reading wallet…" : "Refresh wallet"}
        </button>
      </div>
      <div
        className={styles.hallTabs}
        role="tablist"
        aria-label="City Hall views"
      >
        {(["holdings", "performance"] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={hallView === view}
            className={hallView === view ? styles.hallTabActive : ""}
            onClick={() => setHallView(view)}
          >
            {view === "holdings" ? "Holdings" : "Performance"}
          </button>
        ))}
      </div>
      {hallView === "holdings" &&
        (!walletAddress ? (
          <div className={styles.empty}>
            <h4>Connect your wallet to see your holdings.</h4>
            <p>
              USDT funds purchases and BNB pays transaction fees on BNB Smart
              Chain.
            </p>
            {onConnectWallet && (
              <button
                type="button"
                className={styles.primary}
                disabled={connecting}
                onClick={() => void connect()}
              >
                <Wallet size={15} />
                {connecting ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={styles.summaryStrip}>
              <Metric
                label={unpriced ? "Priced token value" : "Stock token value"}
                value={
                  matchingBalance
                    ? holdings.length && !pricedHoldings.length
                      ? "Price unavailable"
                      : usd(valued)
                    : "—"
                }
                detail={
                  matchingBalance
                    ? `${pricedHoldings.length} priced ${pricedHoldings.length === 1 ? "holding" : "holdings"}${unpriced ? ` · ${unpriced} price unavailable` : " · market observations"}`
                    : "Waiting for BSC balances"
                }
              />
              <Metric
                label="Available USDT"
                value={
                  matchingBalance
                    ? `${units(matchingBalance.usdt.formatted, 6)} USDT`
                    : "—"
                }
                detail="Actual wallet balance · purchases and sale proceeds"
              />
              <Metric
                label="BNB for gas"
                value={
                  matchingBalance
                    ? `${units(matchingBalance.bnb.formatted)} BNB`
                    : "—"
                }
                detail="Actual wallet balance · transaction fees"
              />
            </div>
            {readError && (
              <p className={styles.warning} role="alert">
                {readError}{" "}
                {matchingBalance
                  ? "Previously read balances are shown; refresh before trading."
                  : "Balances have not been verified."}
              </p>
            )}
            <div className={styles.hallGrid}>
              <section
                className={styles.section}
                aria-labelledby="mainnet-wallet-holdings"
              >
                <div className={styles.sectionHeading}>
                  <h4 id="mainnet-wallet-holdings">Your stock tokens</h4>
                  <span>
                    {holdings.length}{" "}
                    {holdings.length === 1 ? "asset" : "assets"}
                  </span>
                </div>
                {!matchingBalance ? (
                  <p className={styles.caption}>
                    {loading
                      ? "Reading BSC wallet balances…"
                      : "Balances unavailable. Refresh to retry."}
                  </p>
                ) : !holdings.length ? (
                  <div className={styles.empty}>
                    <h4>Your first stock token starts the city.</h4>
                    <p>
                      Review a supported token, buy a fraction with USDT, and
                      wait for confirmed settlement.
                    </p>
                    {onClose && (
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={onClose}
                      >
                        Return to city <ArrowUpRight size={15} />
                      </button>
                    )}
                  </div>
                ) : (
                  holdings.map((holding) => {
                    const price = holding.asset.priceUsd
                      ? Number(holding.asset.priceUsd)
                      : null;
                    return (
                      <div
                        key={holding.asset.address}
                        className={styles.holdingRow}
                      >
                        <div className={styles.assetIdentity}>
                          <StockLogo
                            ticker={holding.asset.ticker}
                            name={holding.asset.name}
                            size={36}
                          />
                          <div>
                            <strong>{holding.asset.symbol}</strong>
                            <small>
                              {units(holding.formatted)} tokens ·{" "}
                              {holding.asset.platform}
                            </small>
                            <small>Wallet balance verified on BSC</small>
                          </div>
                        </div>
                        <div className={styles.numeric}>
                          <strong>
                            {price && Number.isFinite(price)
                              ? usd(Number(holding.formatted) * price)
                              : "Price unavailable"}
                          </strong>
                          <small>
                            {price && Number.isFinite(price)
                              ? `${usd(price)} / token`
                              : "Token quantity remains verified"}
                          </small>
                          {holding.asset.priceUpdatedAt && (
                            <small>
                              Observed {time(holding.asset.priceUpdatedAt)}
                            </small>
                          )}
                        </div>
                        <div className={styles.rowActions}>
                          {onTrade ? (
                            <button
                              type="button"
                              className={styles.secondary}
                              onClick={() =>
                                onTrade(holding.asset.address, "sell")
                              }
                            >
                              Sell
                            </button>
                          ) : onFocusTicker ? (
                            <button
                              type="button"
                              className={styles.secondary}
                              onClick={() =>
                                onFocusTicker(holding.asset.ticker)
                              }
                            >
                              Manage
                            </button>
                          ) : (
                            <a
                              className={styles.textLink}
                              href={bscAddressLink(holding.asset.address)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Token <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </section>
              <aside className={styles.treasury}>
                <section
                  className={styles.section}
                  aria-label="Sector allocation"
                >
                  <div className={styles.sectionHeading}>
                    <h4>Sector allocation</h4>
                    <span>Actual wallet holdings</span>
                  </div>
                  {sectors.length ? (
                    sectors.map(([sector, value]) => (
                      <div className={styles.allocation} key={sector}>
                        <div>
                          <span>{sector}</span>
                          <strong>
                            {unpriced || valued <= 0
                              ? "—"
                              : `${((value / valued) * 100).toFixed(1)}%`}
                          </strong>
                        </div>
                        <div className={styles.bar}>
                          <span
                            style={{
                              width:
                                unpriced || valued <= 0
                                  ? "0%"
                                  : `${(value / valued) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className={styles.caption}>
                      {matchingBalance
                        ? "Sector allocation appears after your first token purchase."
                        : "Load your wallet to inspect its allocation."}
                    </p>
                  )}
                  {unpriced > 0 && (
                    <p className={styles.caption}>
                      Allocation is unavailable while any holding lacks a token
                      price.
                    </p>
                  )}
                </section>
                <section className={styles.section}>
                  <div className={styles.sectionHeading}>
                    <h4>Settlement wallet</h4>
                    <span>BSC · 56</span>
                  </div>
                  <p className={styles.caption}>
                    Stock tokens and USDT settle directly in this wallet. Sales
                    return USDT here after confirmed execution.
                  </p>
                  <dl className={styles.facts}>
                    <Fact label="Address">
                      {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                    </Fact>
                    <Fact label="Updated">
                      {matchingBalance
                        ? time(matchingBalance.fetchedAt)
                        : "Not yet verified"}
                    </Fact>
                    <Fact label="Trading">Spot · USDT pairs</Fact>
                  </dl>
                  <div className={styles.sourceLinks}>
                    <a
                      href={bscAddressLink(walletAddress)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wallet on BscScan <ExternalLink size={13} />
                    </a>
                    <a
                      href={bscAddressLink(USDT_ADDRESS)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      USDT contract <ExternalLink size={13} />
                    </a>
                  </div>
                  <p className={styles.caption}>
                    Tokenized stocks are issuer tokens with their own terms.
                    Market prices can differ from the underlying stock.
                  </p>
                </section>
              </aside>
            </div>
            <section
              className={styles.section}
              aria-labelledby="mainnet-trade-receipts"
            >
              <div className={styles.sectionHeading}>
                <h4 id="mainnet-trade-receipts">Trade receipts</h4>
                <span>
                  {history.length} {history.length === 1 ? "trade" : "trades"}
                </span>
              </div>
              {!history.length && (
                <p className={styles.caption}>
                  Trades made in Stockva with this wallet will appear here.
                </p>
              )}
              {history.map((receipt) => (
                <div key={receipt.quoteId} className={styles.transaction}>
                  <div>
                    <strong>
                      {receipt.side === "buy" ? "Buy" : "Sell"}{" "}
                      {receipt.asset.symbol} · {statusLabel[receipt.status]}
                    </strong>
                    <small>
                      {receipt.fromFormatted ?? "—"}{" "}
                      {receipt.side === "buy" ? "USDT" : receipt.asset.symbol} →{" "}
                      {receipt.toFormatted ?? "—"}{" "}
                      {receipt.side === "buy" ? receipt.asset.symbol : "USDT"} ·{" "}
                      {time(receipt.filledAt ?? receipt.createdAt)}
                    </small>
                    {receipt.error && (
                      <small className={styles.warning}>{receipt.error}</small>
                    )}
                    {receipt.approvalHash && (
                      <a
                        className={styles.textLink}
                        href={bscTxLink(receipt.approvalHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Allowance approval <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {receipt.txHash ? (
                    <a
                      href={bscTxLink(receipt.txHash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <code>
                        {receipt.txHash.slice(0, 8)}…{receipt.txHash.slice(-6)}
                      </code>
                      <ExternalLink size={14} />
                      <span className={styles.srOnly}>
                        View trade transaction
                      </span>
                    </a>
                  ) : (
                    <small>
                      {receipt.status === "PENDING"
                        ? "Receipt pending"
                        : "No settlement transaction"}
                    </small>
                  )}
                </div>
              ))}
              <p className={styles.caption}>
                This view covers Stockva trades. Your wallet explorer shows its
                complete on-chain activity. Only confirmed trades update wallet
                holdings.
              </p>
            </section>
          </>
        ))}
      <MainnetPerformance
        active={hallView === "performance"}
        account={walletAddress ?? null}
        balance={matchingBalance}
        readError={readError}
        receipts={receipts}
        onTrade={onTrade}
      />
      {error && (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
