"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { sprite, defFor, type Building, type CityState } from "../lib/city";
import type {
  EvmAddress,
  MainnetAsset,
  MainnetReceipt,
  WalletBalances,
} from "../lib/mainnet";
import CivicCityHall from "./civic-city-hall";
import CivicMarket from "./civic-market";
import RwaSessionClock from "./rwa-session-clock";
import styles from "./civic-panel.module.css";

export type CivicMode = "portfolio" | "market" | "data";
export type CivicProps = {
  mode: CivicMode;
  city: CityState;
  assets: MainnetAsset[];
  balance: WalletBalances | null;
  receipts: MainnetReceipt[];
  loading: boolean;
  error?: string | null;
  balanceLoading?: boolean;
  balanceError?: string | null;
  walletAddress?: EvmAddress | null;
  initialAsset: MainnetAsset | null;
  onClose: () => void;
  onRetry: () => void;
  onTrade: (asset: MainnetAsset, side: "buy" | "sell", amount?: string) => void;
  onPlaceAsset: (asset: MainnetAsset) => void;
  onFocus: (building: Building) => void;
  onScan: () => void;
  onConnectWallet: () => void;
  onFundWallet: () => void;
};

const services = {
  portfolio: {
    title: "City Hall",
    image: "functional/portfolio_city_hall",
    description: "Holdings, treasury & city activity",
  },
  market: {
    title: "Stock Exchange",
    image: "functional/stock_exchange",
    description: "Research assets. Build a basket.",
  },
  data: {
    title: "Data Center",
    image: "functional/oracle_data_center",
    description: "Inspect the evidence behind each token",
  },
};
export default function CivicPanel(props: CivicProps) {
  const { mode, onClose } = props;
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const resetScroll = useCallback(() => body.current?.scrollTo({ top: 0 }), []);
  const service = services[mode];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [mode]);
  return (
    <div
      className={styles.backdrop}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={styles.panel}
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="civic-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !busy) onClose();
          if (event.key !== "Tab") return;
          const nodes = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
            ) ?? [],
          ).filter((node) => node.getClientRects().length > 0);
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <Image
              src={sprite(service.image)}
              alt=""
              width={64}
              height={64}
              sizes="64px"
              quality={85}
            />
            <div>
              <h2 id="civic-title">{service.title}</h2>
              <p>{service.description}</p>
            </div>
          </div>
          <div className={styles.headerEnd}>
            {mode !== "portfolio" && (
              <span className={styles.sessionClock}>
                <RwaSessionClock />
              </span>
            )}
            <span className={styles.badge}>BNB Smart Chain · 56</span>
            <button
              className={styles.iconButton}
              aria-label={`Close ${service.title}`}
              disabled={busy}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </header>
        <div ref={body} className={styles.body}>
          {mode === "portfolio" ? (
            <CivicCityHall
              walletAddress={props.walletAddress ?? props.balance?.account}
              balance={props.balance}
              receipts={props.receipts}
              balanceLoading={props.balanceLoading}
              balanceError={props.balanceError}
              onRefresh={props.onRetry}
              onTrade={(address, side) => {
                const asset = props.assets.find(
                  (item) =>
                    item.address.toLowerCase() === address.toLowerCase(),
                );
                if (asset) props.onTrade(asset, side);
              }}
              onConnectWallet={props.onConnectWallet}
              onClose={props.onClose}
              onBusy={setBusy}
              onFocusTicker={(ticker) => {
                const building = props.city.buildings.find(
                  (item) => defFor(item.kind).ticker === ticker,
                );
                if (building) props.onFocus(building);
              }}
            />
          ) : (
            <CivicMarket key={mode} {...props} onResetScroll={resetScroll} />
          )}
        </div>
        <footer className={styles.footer}>
          <span>
            {busy
              ? "Wallet confirmation in progress. Keep this window open."
              : "Stock tokens settle in your wallet. Review issuer terms before trading."}
          </span>
          <span>Stockva</span>
        </footer>
      </div>
    </div>
  );
}
