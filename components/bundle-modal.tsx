"use client";

import { AlertCircle, Layers, X } from "lucide-react";
import type { PendingDirectPurchase } from "../lib/rebalance-execution";
import type { Building, PriceMap } from "../lib/city";
import { defFor, money, sprite } from "../lib/city";
import styles from "./bundle-modal.module.css";

type Props = {
  open: boolean;
  buildings: Building[];
  prices: PriceMap;
  walletAddress: `0x${string}` | null;
  onClose: () => void;
  onConnectWallet: () => Promise<`0x${string}`>;
  onConfirmSuccess: (
    receipts: { buildingId: string; hash: `0x${string}`; vaultId: string }[],
  ) => void;
  onStartConfirmation?: (buildingIds: string[]) => void;
  onFinishConfirmation?: (buildingIds: string[]) => void;
  transactionPending?: boolean;
  onPurchaseSubmitted?: (purchase: PendingDirectPurchase) => void;
  onReviewPurchase?: (building: Building) => void;
};

/** Bundles are a planning list. Every mainnet purchase needs its own reviewed quote. */
export default function BundleModal({
  open,
  buildings,
  onClose,
  onReviewPurchase,
  transactionPending,
}: Props) {
  if (!open || !buildings.length) return null;
  const total = buildings.reduce((sum, building) => sum + building.cost, 0);
  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bundle-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <header className={styles.header}>
          <div className={styles.headerTitleWrap}>
            <Layers size={18} color="#f0b90b" />
            <h2 id="bundle-modal-title" className={styles.headerTitle}>
              Review your stock list
            </h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close stock list"
          >
            <X size={16} />
          </button>
        </header>
        <div className={styles.body}>
          <p className={styles.subtitle}>
            Buy supported stock tokens one at a time. Review a live USDT quote
            for each purchase before signing in your wallet.
          </p>
          <div className={styles.buildingList}>
            {buildings.map((building) => {
              const def = defFor(building.kind);
              return (
                <div key={building.id} className={styles.buildingItem}>
                  <div className={styles.buildingMeta}>
                    <img
                      className={styles.buildingSprite}
                      src={sprite(def.image)}
                      alt=""
                    />
                    <div className={styles.buildingInfo}>
                      <span className={styles.buildingName}>{def.name}</span>
                      <span className={styles.buildingTicker}>
                        {def.ticker} · planned purchase
                      </span>
                    </div>
                  </div>
                  <div className={styles.buildingAmount}>
                    <span className={styles.costVal}>
                      {money(building.cost)} USDT
                    </span>
                    {onReviewPurchase && (
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        disabled={transactionPending}
                        onClick={() => onReviewPurchase(building)}
                      >
                        Review trade
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.summaryBox}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Planned investment</span>
              <span className={styles.summaryTotal}>{money(total)} USDT</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Settlement network</span>
              <span>BNB Smart Chain · 56</span>
            </div>
          </div>
          <div className={styles.errorMessage}>
            <AlertCircle size={15} />
            <span>
              Each trade has separate costs and confirmation. Availability and
              output depend on its live quote.
            </span>
          </div>
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.confirmBtn} onClick={onClose}>
            Return to exchange
          </button>
        </footer>
      </div>
    </div>
  );
}
