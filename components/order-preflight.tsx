"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Coins,
  Fuel,
  Sliders,
} from "lucide-react";
import { useMainnetWallet } from "./use-mainnet-wallet";
import styles from "./order-preflight.module.css";

interface OrderPreflightProps {
  amount: number;
  itemCount?: number;
  walletAddress?: `0x${string}` | null;
  /** Kept for source compatibility; no funding or faucet action is performed. */
  onFaucetClaimed?: () => void;
  compact?: boolean;
  side?: "buy" | "sell";
  gasBnb?: string | null;
  slippageBps?: number | null;
  quoteExpiresAt?: string | null;
}

export function OrderPreflight({
  amount,
  itemCount = 1,
  walletAddress,
  compact = false,
  side = "buy",
  gasBnb,
  slippageBps,
  quoteExpiresAt,
}: OrderPreflightProps) {
  const { balance, loading, error } = useMainnetWallet(walletAddress);
  const validAmount = Number.isFinite(amount) && amount > 0;
  const usdt = balance ? Number(balance.usdt.formatted) : null;
  const bnb = balance ? Number(balance.bnb.formatted) : null;
  const enoughUsdt = usdt !== null && validAmount && usdt >= amount;
  const hasGas = bnb !== null && bnb > 0;
  const quoteFresh = quoteExpiresAt
    ? Date.parse(quoteExpiresAt) > Date.now()
    : null;
  const status = !walletAddress
    ? "Disconnected"
    : loading
      ? "Checking…"
      : error || !balance
        ? "Unavailable"
        : side === "sell" || enoughUsdt
          ? "Available"
          : "Low";

  return (
    <div className={`${styles.preflight} ${compact ? styles.compact : ""}`}>
      <div className={styles.preflightHeader}>
        <span className={styles.preflightTitle}>
          <Activity size={13} className={styles.pulseIcon} /> WALLET & TRADE
          CHECKS
        </span>
        <span className={styles.networkBadge}>BSC MAINNET · 56</span>
      </div>
      <div className={styles.grid}>
        <div
          className={`${styles.card} ${balance && side === "buy" && !enoughUsdt ? styles.cardWarning : ""}`}
        >
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>
              <Coins size={13} /> Wallet USDT
            </span>
            <span
              className={
                balance && !error && (side === "sell" || enoughUsdt)
                  ? styles.badgeSuccess
                  : styles.badgeMuted
              }
            >
              {status}
            </span>
          </div>
          <div className={styles.cardValue}>
            {usdt !== null && !error
              ? `${usdt.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT`
              : loading
                ? "Reading…"
                : "—"}
          </div>
          <small className={styles.cardSub}>
            Read from the connected BSC wallet
          </small>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>
              <Fuel size={13} /> BNB for gas
            </span>
            <span
              className={
                hasGas && !error ? styles.badgeSuccess : styles.badgeMuted
              }
            >
              {hasGas && !error ? (
                <>
                  <CheckCircle2 size={11} /> Funded
                </>
              ) : (
                "Needs funding"
              )}
            </span>
          </div>
          <div className={styles.cardValue}>
            {bnb !== null && !error
              ? `${bnb.toLocaleString("en-US", { maximumFractionDigits: 8 })} BNB`
              : "—"}
          </div>
          <small className={styles.cardSub}>
            {gasBnb
              ? `Quote estimate: ${gasBnb} BNB`
              : "Wallet displays the actual fee before approval"}
          </small>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>
              <Sliders size={13} /> Slippage limit
            </span>
            <span className={styles.badgeMuted}>Per quote</span>
          </div>
          <div className={styles.cardValue}>
            {typeof slippageBps === "number"
              ? `${(slippageBps / 100).toFixed(2)}%`
              : "Review quote"}
          </div>
          <small className={styles.cardSub}>
            Verify minimum output before signing
          </small>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTop}>
            <span className={styles.cardLabel}>
              <Activity size={13} /> Execution
            </span>
            <span className={styles.badgeMuted}>
              {itemCount > 1 ? "Individual trades" : "Spot"}
            </span>
          </div>
          <div className={styles.cardValue}>
            {quoteFresh === false
              ? "Quote expired"
              : quoteFresh
                ? "Fresh quote"
                : "Quote required"}
          </div>
          <small className={styles.cardSub}>
            Stock tokens settle in your wallet
          </small>
        </div>
      </div>
      {balance &&
        !error &&
        ((side === "buy" && validAmount && !enoughUsdt) || !hasGas) && (
          <div className={styles.warningBanner}>
            <AlertTriangle size={15} />
            <div className={styles.warningContent}>
              <strong>
                {!hasGas
                  ? "BNB is required for transaction fees"
                  : "Not enough USDT for this purchase"}
              </strong>
              <p>
                Fund this wallet with USDT and BNB on BNB Smart Chain, then
                refresh its balances.
              </p>
            </div>
          </div>
        )}
      {error && (
        <div className={styles.errorBanner} role="alert">
          <AlertTriangle size={13} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
