"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletBalances } from "../lib/mainnet";

/** Read real BSC balances; an unavailable RPC must never become an invented zero. */
export function useMainnetWallet(account?: `0x${string}` | null) {
  const [balance, setBalance] = useState<WalletBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    setBalance(null);
    setError(null);
  }, [account]);
  useEffect(() => {
    if (!account) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let current = true;
    let running = false;
    const read = async () => {
      if (running) return;
      running = true;
      setLoading(true);
      try {
        const response = await fetch(
          `/api/wallet/balances?account=${encodeURIComponent(account)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : "Wallet balances are unavailable. Retry shortly.",
          );
        if (
          payload.chainId !== 56 ||
          typeof payload.account !== "string" ||
          payload.account.toLowerCase() !== account.toLowerCase() ||
          !payload.usdt ||
          !payload.bnb ||
          !Array.isArray(payload.holdings)
        )
          throw new Error("Wallet balance response could not be verified.");
        if (current) {
          setBalance(payload as WalletBalances);
          setError(null);
        }
      } catch (caught) {
        if (current && !controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Wallet balances are unavailable.",
          );
      } finally {
        running = false;
        if (current) setLoading(false);
      }
    };
    void read();
    const timer = setInterval(() => {
      void read();
    }, 30_000);
    return () => {
      current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [account, revision]);

  // Do not show an earlier wallet's balance even during the first render after switching.
  const matchingBalance =
    balance?.account.toLowerCase() === account?.toLowerCase() ? balance : null;
  return { balance: matchingBalance, loading, error, refresh };
}
