"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getAddress } from "viem";
import { LogOut } from "lucide-react";
import styles from "./landing-hero.module.css";

export default function WalletConnect({ appId }: { appId?: string }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [providerAddress, setProviderAddress] = useState<string | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const rawAddress = user?.wallet?.address || wallets?.[0]?.address;
  let formatted: string | undefined;
  if (rawAddress) {
    try {
      formatted = getAddress(rawAddress);
    } catch {
      formatted = undefined;
    }
  }

  const label = formatted
    ? `${formatted.slice(0, 6)}…${formatted.slice(-4)}`
    : "Connected";
  const verified = Boolean(
    authenticated && formatted && providerAddress === formatted,
  );

  useEffect(() => {
    let cancelled = false;
    let version = 0;
    let removeListener: (() => void) | undefined;
    setProviderAddress(null);
    if (!authenticated || !formatted) {
      setCheckingAccount(false);
      return;
    }
    const expected = formatted;
    const connected = wallets.find(
      (wallet) => wallet.address.toLowerCase() === expected.toLowerCase(),
    );
    if (!connected) {
      setCheckingAccount(false);
      return;
    }
    setCheckingAccount(true);
    void connected
      .getEthereumProvider()
      .then(async (provider) => {
        const events = provider as typeof provider & {
          on?: (event: string, listener: () => void) => void;
          removeListener?: (event: string, listener: () => void) => void;
        };
        const read = async () => {
          const readVersion = ++version;
          try {
            const accounts = await provider.request({ method: "eth_accounts" });
            const actual =
              Array.isArray(accounts) && typeof accounts[0] === "string"
                ? getAddress(accounts[0])
                : null;
            if (!cancelled && readVersion === version)
              setProviderAddress(actual === expected ? actual : null);
          } catch {
            if (!cancelled && readVersion === version) setProviderAddress(null);
          } finally {
            if (!cancelled && readVersion === version)
              setCheckingAccount(false);
          }
        };
        const changed = () => {
          setProviderAddress(null);
          setCheckingAccount(true);
          void read();
        };
        if (!cancelled) {
          events.on?.("accountsChanged", changed);
          removeListener = () =>
            events.removeListener?.("accountsChanged", changed);
          await read();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviderAddress(null);
          setCheckingAccount(false);
        }
      });
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [authenticated, formatted, wallets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (verified && formatted) {
      localStorage.setItem("stockcity_connected_wallet", formatted);
    } else if (ready && !verified) {
      localStorage.removeItem("stockcity_connected_wallet");
    }
  }, [ready, verified, formatted]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("stockcity_connected_wallet");
    }
  };

  const handleConnect = async () => {
    setConnectionError(null);
    try {
      if (authenticated && !verified) await logout();
      login({ loginMethods: ["wallet"] });
    } catch (caught) {
      setConnectionError(
        caught instanceof Error
          ? caught.message
          : "Wallet connection unavailable.",
      );
    }
  };

  if (verified && formatted) {
    return (
      <button
        className={styles.wallet}
        disabled={!ready}
        onClick={handleLogout}
        aria-label={`Disconnect wallet ${label}`}
        title={`Connected: ${formatted} · Click to disconnect`}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#22c55e",
            boxShadow: "0 0 8px #22c55e",
            marginRight: 2,
          }}
        />
        <LogOut size={14} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      className={styles.walletImgBtn}
      disabled={!ready || checkingAccount}
      onClick={() => void handleConnect()}
      aria-label={
        checkingAccount
          ? "Checking wallet account"
          : authenticated
            ? "Reconnect wallet"
            : "Connect wallet"
      }
      title={
        connectionError ??
        (checkingAccount
          ? "Checking wallet account…"
          : authenticated
            ? "Reconnect wallet · account unavailable"
            : "Connect wallet · BNB Smart Chain")
      }
    >
      <img
        src="/assets/connect-wallet.png"
        alt="Connect Wallet"
        className={styles.connectWalletImg}
      />
    </button>
  );
}
