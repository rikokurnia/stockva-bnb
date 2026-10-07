"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getAddress } from "viem";
import {
  AlertCircle,
  Check,
  Coins,
  Copy,
  ExternalLink,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { bscAddressLink, ensureBscMainnet, USDT_ADDRESS } from "../lib/mainnet";
import { useMainnetWallet } from "./use-mainnet-wallet";
import styles from "./mainnet-funding-modal.module.css";

export type MainnetFundingModalProps = {
  open: boolean;
  onClose: () => void;
  walletAddress: `0x${string}` | null;
  onWalletConnected?: (address: `0x${string}`) => void;
  onRefresh?: () => void;
};

export default function MainnetFundingModal({
  open,
  onClose,
  walletAddress,
  onWalletConnected,
  onRefresh,
}: MainnetFundingModalProps) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const rawAddress = user?.wallet?.address || wallets[0]?.address;
  let privyAddress: `0x${string}` | null = null;
  if (ready && authenticated && rawAddress) {
    try {
      privyAddress = getAddress(rawAddress);
    } catch {
      /* Invalid wallet addresses are never used. */
    }
  }
  const activeWallet = walletAddress;
  const {
    balance,
    loading,
    error: balanceError,
    refresh,
  } = useMainnetWallet(open ? activeWallet : null);
  useEffect(() => {
    if (!open || !privyAddress || !onWalletConnected) return;
    let cancelled = false;
    const connected = wallets.find(
      (wallet) => wallet.address.toLowerCase() === privyAddress.toLowerCase(),
    );
    void connected
      ?.getEthereumProvider()
      .then(async (provider) => {
        const accounts = await provider.request({ method: "eth_accounts" });
        if (
          !cancelled &&
          Array.isArray(accounts) &&
          typeof accounts[0] === "string" &&
          getAddress(accounts[0]) === privyAddress
        )
          onWalletConnected(privyAddress);
      })
      .catch(() => {
        /* The main wallet menu offers reconnection. */
      });
    return () => {
      cancelled = true;
    };
  }, [open, privyAddress, wallets, onWalletConnected]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  const connect = async () => {
    setError(null);
    try {
      if (authenticated && !walletAddress) await logout();
      onClose();
      login({ loginMethods: ["wallet"] });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not connect your wallet.",
      );
    }
  };
  const switchChain = async () => {
    const connected = wallets.find(
      (wallet) => wallet.address.toLowerCase() === activeWallet?.toLowerCase(),
    );
    if (!connected) {
      setError("Reconnect the wallet to switch its network.");
      return;
    }
    setSwitching(true);
    setError(null);
    try {
      await ensureBscMainnet(await connected.getEthereumProvider());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not switch to BNB Smart Chain.",
      );
    } finally {
      setSwitching(false);
    }
  };
  const copy = async () => {
    if (!activeWallet) return;
    try {
      await navigator.clipboard.writeText(activeWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the wallet address.");
    }
  };
  const readAgain = () => {
    refresh();
    onRefresh?.();
  };
  const hasFunds =
    balance &&
    !balanceError &&
    BigInt(balance.usdt.raw) > 0n &&
    BigInt(balance.bnb.raw) > 0n;
  const format = (value: string, decimals: number) =>
    Number(value).toLocaleString("en-US", { maximumFractionDigits: decimals });
  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget && !switching) onClose();
      }}
    >
      <div
        className={styles.modal}
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mainnet-funding-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !switching) onClose();
          if (event.key !== "Tab") return;
          const nodes = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), a[href]",
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
        <button
          type="button"
          className={styles.closeBtn}
          disabled={switching}
          onClick={onClose}
          aria-label="Close wallet funding"
        >
          <X size={18} />
        </button>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <Coins size={28} />
          </div>
          <div className={styles.titleArea}>
            <h2 id="mainnet-funding-title">
              Fund your wallet <span className={styles.badgeTag}>BSC · 56</span>
            </h2>
            <p className={styles.subtitle}>
              USDT buys stock tokens. BNB pays transaction fees.
            </p>
          </div>
        </div>
        <div className={styles.stepsContainer}>
          <section
            className={`${styles.stepCard} ${activeWallet ? styles.completed : styles.active}`}
          >
            <div className={styles.stepHeader}>
              <span className={styles.stepTitle}>
                <span className={styles.stepNum}>
                  {activeWallet ? <Check size={14} /> : "1"}
                </span>
                Connect your wallet
              </span>
            </div>
            {activeWallet ? (
              <>
                <p className={styles.walletAddress}>{activeWallet}</p>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => void copy()}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Address copied" : "Copy wallet address"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!ready}
                onClick={() => void connect()}
              >
                <Wallet size={16} />
                Connect wallet
              </button>
            )}
          </section>
          <section className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepTitle}>
                <span className={styles.stepNum}>2</span>Send USDT and BNB on
                BSC
              </span>
            </div>
            <p className={styles.stepDesc}>
              Transfer a small amount of USDT and some BNB to the address above.
              Select BNB Smart Chain (BEP-20) when withdrawing or transferring.
              The live quote determines the minimum trade size and costs.
            </p>
            <a
              href={bscAddressLink(USDT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className={styles.txLink}
            >
              Check the BSC USDT contract <ExternalLink size={12} />
            </a>
            {activeWallet && (
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={switching}
                onClick={() => void switchChain()}
              >
                {switching ? "Switching…" : "Switch wallet to BNB Smart Chain"}
              </button>
            )}
          </section>
        </div>
        <div className={styles.treasuryCard}>
          <div>
            <span className={styles.treasuryLabel}>
              Verified wallet balances
            </span>
            <div className={styles.treasuryAmount}>
              {balance && !balanceError
                ? `${format(balance.usdt.formatted, 6)} USDT`
                : loading
                  ? "Reading wallet…"
                  : "—"}
            </div>
            <p className={styles.stepDesc}>
              {balance && !balanceError
                ? `${format(balance.bnb.formatted, 8)} BNB`
                : "Connect and refresh to read BSC balances"}
            </p>
          </div>
          <button
            type="button"
            className={styles.dismissBtn}
            disabled={!activeWallet || loading}
            onClick={readAgain}
            aria-label="Refresh wallet balances"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {(error || balanceError) && (
          <p className={styles.errorBanner} role="alert">
            <AlertCircle size={16} />
            {error || balanceError}
          </p>
        )}
        {hasFunds && (
          <p className={styles.stepDesc}>
            USDT and BNB detected. Review a live quote before buying.
          </p>
        )}
        <div className={styles.footer}>
          <p className={styles.footerNote}>Funds stay in your wallet.</p>
          <button
            type="button"
            className={styles.dismissBtn}
            disabled={switching}
            onClick={onClose}
          >
            Return to city
          </button>
        </div>
      </div>
    </div>
  );
}
