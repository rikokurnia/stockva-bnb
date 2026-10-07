"use client";

import { useEffect, useState } from "react";
import { getAddress } from "viem";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ExternalLink, LogOut, Check, Copy, Network } from "lucide-react";
import { bscAddressLink, ensureBscMainnet } from "../lib/mainnet";

type Props = {
  address: `0x${string}` | null;
  onChange: (address: `0x${string}` | null) => void;
};
type NetworkStatus = "checking" | "mainnet" | "other" | "unknown";

export default function OnchainWallet({ onChange }: Props) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [network, setNetwork] = useState<NetworkStatus>("checking");
  const [providerMismatch, setProviderMismatch] = useState(false);
  const rawAddress = user?.wallet?.address || wallets[0]?.address;
  let authenticatedAddress: `0x${string}` | null = null;
  if (ready && authenticated && rawAddress) {
    try {
      authenticatedAddress = getAddress(rawAddress);
    } catch {
      /* Invalid addresses cannot trade. */
    }
  }
  const activeAddress = providerMismatch ? null : authenticatedAddress;
  const connected = wallets.find(
    (wallet) =>
      wallet.address.toLowerCase() === authenticatedAddress?.toLowerCase(),
  );

  useEffect(() => {
    if (!ready) return;
    onChange(activeAddress);
    // A remembered address is a convenience, never a connected wallet or balance.
    try {
      if (activeAddress)
        localStorage.setItem("stockcity_connected_wallet", activeAddress);
      else localStorage.removeItem("stockcity_connected_wallet");
    } catch {
      /* Remembering an address is optional; provider checks still determine connection. */
    }
  }, [ready, activeAddress, onChange]);

  useEffect(() => {
    let cancelled = false;
    let accountReadVersion = 0;
    let removeListener: (() => void) | undefined;
    setNetwork("checking");
    setProviderMismatch(false);
    if (!connected) {
      setNetwork("unknown");
      return;
    }
    void connected
      .getEthereumProvider()
      .then(async (provider) => {
        const events = provider as typeof provider & {
          on?: (event: string, listener: () => void) => void;
          removeListener?: (event: string, listener: () => void) => void;
        };
        const readChain = async () => {
          try {
            const chain = await provider.request({ method: "eth_chainId" });
            if (!cancelled)
              setNetwork(Number(chain) === 56 ? "mainnet" : "other");
          } catch {
            if (!cancelled) setNetwork("unknown");
          }
        };
        const readAccount = async () => {
          const version = ++accountReadVersion;
          try {
            const accounts = await provider.request({ method: "eth_accounts" });
            const current =
              Array.isArray(accounts) && typeof accounts[0] === "string"
                ? getAddress(accounts[0])
                : null;
            if (cancelled || version !== accountReadVersion) return;
            const mismatch = current !== authenticatedAddress;
            setProviderMismatch(mismatch);
            if (mismatch) {
              onChange(null);
              setError(
                "Wallet account changed or disconnected. Reconnect before trading.",
              );
              setMenuOpen(false);
            } else setError(null);
          } catch {
            if (!cancelled && version === accountReadVersion) {
              setProviderMismatch(true);
              onChange(null);
              setError(
                "Wallet account could not be verified. Reconnect your wallet.",
              );
            }
          }
        };
        const changed = () => {
          void readChain();
        };
        const accountsChanged = () => {
          // Invalidate the previous account before an asynchronous provider read.
          setProviderMismatch(true);
          onChange(null);
          void readAccount();
        };
        if (!cancelled) {
          events.on?.("chainChanged", changed);
          events.on?.("accountsChanged", accountsChanged);
          removeListener = () => {
            events.removeListener?.("chainChanged", changed);
            events.removeListener?.("accountsChanged", accountsChanged);
          };
          await readAccount();
          await readChain();
        }
      })
      .catch(() => {
        if (!cancelled) setNetwork("unknown");
      });
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [connected, authenticatedAddress, onChange]);

  const connect = async () => {
    setError(null);
    try {
      if (providerMismatch && authenticated) await logout();
      login({ loginMethods: ["wallet"] });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Wallet connection unavailable.",
      );
    }
  };
  const switchNetwork = async () => {
    if (!connected) {
      setError("Wallet provider is unavailable. Reconnect your wallet.");
      return;
    }
    setSwitching(true);
    setError(null);
    try {
      const provider = await connected.getEthereumProvider();
      await ensureBscMainnet(provider);
      const chain = await provider.request({ method: "eth_chainId" });
      setNetwork(Number(chain) === 56 ? "mainnet" : "other");
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
  const disconnect = async () => {
    try {
      await logout();
      onChange(null);
      localStorage.removeItem("stockcity_connected_wallet");
      setMenuOpen(false);
    } catch {
      setError("Could not disconnect. Try again.");
    }
  };
  const copyAddress = async () => {
    if (!activeAddress) return;
    try {
      await navigator.clipboard.writeText(activeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the address.");
    }
  };
  const shorten = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
  const networkLabel =
    network === "mainnet"
      ? "BNB Smart Chain · 56"
      : network === "checking"
        ? "Checking wallet network…"
        : network === "other"
          ? "Switch to BNB Smart Chain"
          : "Wallet network unavailable";

  if (!activeAddress)
    return (
      <div className="onchain-wallet-wrapper">
        <button
          type="button"
          className="onchain-wallet-img-btn"
          onClick={() => void connect()}
          disabled={!ready}
          title={
            providerMismatch
              ? "Reconnect wallet · account changed"
              : "Connect wallet · BNB Smart Chain"
          }
          aria-label={providerMismatch ? "Reconnect wallet" : "Connect wallet"}
        >
          <img
            src="/assets/connect-wallet.png"
            alt="Connect Wallet"
            className="onchain-wallet-img"
          />
        </button>
        {error && (
          <div className="onchain-wallet-tooltip" role="alert">
            {error}
          </div>
        )}
      </div>
    );

  return (
    <div className="onchain-wallet-wrapper">
      <button
        type="button"
        className="onchain-wallet-btn connected-btn"
        onClick={() => setMenuOpen((value) => !value)}
        title={`${activeAddress} · ${networkLabel}`}
      >
        {network === "mainnet" ? (
          <span className="live-pulse-dot" />
        ) : (
          <Network size={13} color="#f0b90b" />
        )}
        <span className="wallet-addr-text">{shorten(activeAddress)}</span>
      </button>
      {menuOpen && (
        <>
          <div
            className="onchain-wallet-backdrop"
            onClick={() => setMenuOpen(false)}
          />
          <div className="onchain-wallet-menu">
            <div className="wallet-menu-header">
              <span className="wallet-badge">{networkLabel}</span>
              <span className="wallet-user-label">Connected wallet</span>
              <strong className="wallet-full-addr">
                {shorten(activeAddress)}
              </strong>
              <small className="wallet-raw-addr">{activeAddress}</small>
            </div>
            {network !== "mainnet" && (
              <button
                type="button"
                className="wallet-menu-item"
                disabled={switching}
                onClick={() => void switchNetwork()}
              >
                <Network size={13} />
                <span>
                  {switching ? "Switching…" : "Switch to BNB Smart Chain"}
                </span>
              </button>
            )}
            <button
              type="button"
              className="wallet-menu-item"
              onClick={() => void copyAddress()}
            >
              {copied ? (
                <Check size={13} color="#22c55e" />
              ) : (
                <Copy size={13} />
              )}
              <span>{copied ? "Copied" : "Copy address"}</span>
            </button>
            <a
              href={bscAddressLink(activeAddress)}
              target="_blank"
              rel="noreferrer"
              className="wallet-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <ExternalLink size={13} />
              <span>View on BscScan</span>
            </a>
            <button
              type="button"
              className="wallet-menu-item danger"
              onClick={() => void disconnect()}
            >
              <LogOut size={13} />
              <span>Disconnect</span>
            </button>
            {error && (
              <p className="onchain-wallet-tooltip" role="alert">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
