"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  SlidersHorizontal,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { assets, money } from "../lib/city";
import {
  bscAddressLink,
  type EvmAddress,
  type MainnetAsset,
  type WalletBalances,
} from "../lib/mainnet";
import styles from "./agent-hall.module.css";

type Props = {
  balance: WalletBalances | null;
  account: EvmAddress | null;
  onClose: () => void;
  onTrade: (asset: MainnetAsset, side: "buy" | "sell") => void;
  onConnectWallet: () => void;
};
const colors = [
  "#657b4a",
  "#c1974b",
  "#638d8b",
  "#b8775c",
  "#8d80a3",
  "#a6ae79",
];

export default function MainnetAgentHall({
  balance,
  account,
  onClose,
  onTrade,
  onConnectWallet,
}: Props) {
  const [tab, setTab] = useState("Rebalance");
  const [selected, setSelected] = useState<string | null>(null);
  const [goal, setGoal] = useState(
    "Review my concentration and explain one practical next step.",
  );
  const [report, setReport] = useState<{
    text: string;
    context: string;
    key: string;
    time: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingContext, setPendingContext] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const dialog = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const accountKey = account?.toLowerCase() ?? "";
  const currentAccount = useRef(accountKey);
  currentAccount.current = accountKey;
  const wallet =
    balance?.chainId === 56 && balance.account.toLowerCase() === accountKey
      ? balance
      : null;
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    return () => {
      mounted.current = false;
      generation.current += 1;
      request.current?.abort();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    generation.current += 1;
    request.current?.abort();
    setBusy(false);
    setReport(null);
    setError("");
    setEvents([]);
    setSelected(null);
  }, [accountKey]);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [tab]);
  const { holdings, total, allValued, sectors, concentration } = useMemo(() => {
    const positions = (wallet?.holdings ?? []).map((holding) => {
      const units = Number(holding.formatted);
      const observed = holding.asset.priceUsd;
      const price = observed === null ? null : Number(observed);
      const value =
        Number.isFinite(units) &&
        price !== null &&
        Number.isFinite(price) &&
        price > 0
          ? units * price
          : null;
      return {
        ...holding,
        units: Number.isFinite(units) ? units : undefined,
        price:
          price !== null && Number.isFinite(price) && price > 0
            ? price
            : undefined,
        value,
        sector:
          assets.find((asset) => asset.ticker === holding.asset.ticker)
            ?.sector ?? "Other",
      };
    });
    positions.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const value = positions.reduce(
      (sum, holding) => sum + (holding.value ?? 0),
      0,
    );
    const priced = positions.every((holding) => holding.value !== null);
    return {
      holdings: positions,
      total: value,
      allValued: priced,
      sectors: Array.from(new Set(positions.map((holding) => holding.sector))),
      concentration:
        priced && value > 0 ? ((positions[0]?.value ?? 0) / value) * 100 : null,
    };
  }, [wallet]);
  const focus = holdings.find((holding) => holding.asset.address === selected);
  const analysisKey = JSON.stringify([
    tab,
    goal,
    accountKey,
    wallet?.fetchedAt,
  ]);
  const contextLabel =
    tab === "Rebalance" ? "Portfolio rebalance review" : "Portfolio overview";
  let cursor = 0;
  const segments = holdings
    .map((holding, index) => {
      const start = cursor;
      cursor += total > 0 ? ((holding.value ?? 0) / total) * 100 : 0;
      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
    })
    .join(",");
  async function analyze() {
    if (busy || !goal.trim() || !wallet) return;
    setBusy(true);
    setPendingContext(contextLabel);
    setError("");
    setReport(null);
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const requestGeneration = ++generation.current;
    const sentAccount = accountKey;
    const isCurrent = () =>
      mounted.current &&
      generation.current === requestGeneration &&
      currentAccount.current === sentAccount;
    const timeout = setTimeout(() => controller.abort(), 55000);
    const cash = Number(wallet.usdt.formatted);
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: goal.trim(),
          hallAnalysis: { mode: "overview" },
          snapshot: {
            cash: Number.isFinite(cash) ? cash : undefined,
            totalValue: allValued ? total : undefined,
            walletConnected: !!account,
            onchainCount: holdings.length,
            holdings: holdings.slice(0, 40).map((holding) => ({
              ticker: holding.asset.ticker,
              name: `${holding.asset.name} (${holding.asset.symbol})`,
              units: holding.units,
              price: holding.price,
              value: holding.value ?? undefined,
              sector: holding.sector,
              onchain: true,
              active: true,
            })),
            marketNote: `BSC mainnet wallet snapshot ${wallet.fetchedAt}; ${holdings.length} token holdings. Observed issuer-token prices; unknown prices and cost basis remain unknown. Trades require a new quote and wallet signature.`,
          },
        }),
      });
      const result = await response.json();
      if (!isCurrent()) return;
      if (
        !response.ok ||
        typeof result.reply !== "string" ||
        !result.reply.trim()
      )
        throw new Error(
          "Cokoo is unavailable right now. Try the review again.",
        );
      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      setReport({
        text: result.reply,
        context: contextLabel,
        key: analysisKey,
        time,
      });
      setEvents((previous) =>
        [`${time} · ${contextLabel} review completed`, ...previous].slice(0, 5),
      );
    } catch {
      if (isCurrent())
        setError(
          controller.signal.aborted
            ? "The review timed out. Please try again."
            : "Cokoo couldn’t finish this review. Check your connection and try again; your wallet snapshot remains available.",
        );
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) setBusy(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className={styles.hall}
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-hall-title"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            const nodes = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
              ) ?? [],
            ).filter((node) => node.getClientRects().length > 0);
            if (!nodes.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <img
              src="/assets/ai_logo.png"
              alt="Cokoo, your city advisor"
              width={64}
              height={64}
            />
            <div>
              <span className={styles.eyebrow}>COKOO’S COMMAND CENTER</span>
              <h2 id="agent-hall-title">Agent Hall</h2>
            </div>
          </div>
          <div className={styles.headerEnd}>
            <span className={styles.badge}>Plan · Sign · Build</span>
            <button
              className={styles.icon}
              onClick={onClose}
              aria-label="Close Agent Hall"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>
        <nav className={styles.tabs} aria-label="Agent Hall sections">
          {["Rebalance", "Overview"].map((section) => (
            <button
              key={section}
              aria-current={tab === section ? "page" : undefined}
              onClick={() => setTab(section)}
            >
              {section === "Rebalance" ? (
                <SlidersHorizontal size={16} aria-hidden="true" />
              ) : (
                <Activity size={16} aria-hidden="true" />
              )}
              {section}
            </button>
          ))}
        </nav>
        <div className={styles.body} ref={body}>
          <section className={styles.intro}>
            <div>
              <span className={styles.eyebrow}>
                YOUR CITY. A LITTLE MORE INTENTION.
              </span>
              <h3>
                {tab === "Rebalance"
                  ? "Review your next move."
                  : "See the bigger picture."}
              </h3>
              <p>
                {tab === "Rebalance"
                  ? "Explore your mainnet holdings, ask Cokoo for a review, and sign each trade after checking its live quote."
                  : "Explore your holdings, spot concentration, and let Cokoo connect the dots."}
              </p>
            </div>
            <img src="/assets/sprites/functional/agent_hall.png" alt="" />
          </section>
          <div className={styles.stats}>
            <div>
              <span>Invested in your city</span>
              <strong>{wallet && allValued ? money(total) : "—"}</strong>
              <small>
                {wallet
                  ? allValued
                    ? "Observed token valuation"
                    : "Some token prices unavailable"
                  : "Connect to load wallet holdings"}
              </small>
            </div>
            <div>
              <span>Unrealized return</span>
              <strong>—</strong>
              <small>Complete cost basis unavailable</small>
            </div>
            <div>
              <span>Available treasury</span>
              <strong>{wallet ? `${wallet.usdt.formatted} USDT` : "—"}</strong>
              <small>
                {wallet
                  ? `${holdings.length} assets · ${sectors.length} sectors`
                  : "Wallet balances unavailable"}
              </small>
            </div>
          </div>
          <div className={styles.grid}>
            <section className={styles.card}>
              <div className={styles.sectionTitle}>
                <h4>
                  {tab === "Rebalance"
                    ? "Your mainnet positions"
                    : "Portfolio landscape"}
                </h4>
                <span>
                  {tab === "Rebalance"
                    ? "Review before signing"
                    : "Click to explore"}
                </span>
              </div>
              {tab === "Rebalance" ? (
                <>
                  <div className={styles.plan}>
                    {holdings.map((holding, index) => (
                      <div key={holding.asset.address}>
                        <i
                          style={{ background: colors[index % colors.length] }}
                        />
                        <div className={styles.assetName}>
                          <b>{holding.asset.symbol}</b>
                          <small>{holding.asset.name}</small>
                          <small>
                            <a
                              href={bscAddressLink(holding.asset.address)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {holding.asset.platform} · token contract
                            </a>
                          </small>
                        </div>
                        <span>
                          {holding.value !== null
                            ? money(holding.value)
                            : "Price unavailable"}
                          <small>{holding.formatted} tokens</small>
                        </span>
                        <button
                          onClick={() => onTrade(holding.asset, "buy")}
                          aria-label={`Review buy ${holding.asset.symbol}`}
                          title={`Review buy ${holding.asset.symbol}`}
                        >
                          <ArrowUpRight size={16} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => onTrade(holding.asset, "sell")}
                          aria-label={`Review sell ${holding.asset.symbol}`}
                          title={`Review sell ${holding.asset.symbol}`}
                        >
                          <SlidersHorizontal size={16} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {!holdings.length && (
                    <p className={styles.muted}>
                      {!account
                        ? "Connect your wallet to load your BNB Smart Chain positions."
                        : wallet
                          ? "Your wallet has no discovered stock tokens yet. Explore issuer tokens at the Stock Exchange."
                          : "Your wallet balances are unavailable. Refresh your wallet before reviewing trades."}
                    </p>
                  )}
                  {!account && (
                    <button
                      className={styles.primary}
                      onClick={onConnectWallet}
                    >
                      Connect wallet
                    </button>
                  )}
                  <div className={styles.callout} style={{ marginTop: 20 }}>
                    <ShieldCheck size={20} aria-hidden="true" />
                    <p>
                      Each buy or sell opens the Stock Exchange for a fresh
                      quote, simulation, and your wallet signature.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.landscape}>
                    <div
                      className={styles.ring}
                      style={{
                        background:
                          allValued && total > 0
                            ? `conic-gradient(${segments})`
                            : "#e5dac1",
                      }}
                      role="img"
                      aria-label={
                        concentration === null
                          ? `${holdings.length} assets; allocation unavailable`
                          : `${holdings.length} assets; largest holding ${concentration.toFixed(1)} percent`
                      }
                    >
                      <div>
                        <span>
                          {focus ? focus.asset.symbol : "Stock value"}
                        </span>
                        <strong>
                          {wallet && allValued
                            ? money(focus?.value ?? total)
                            : "—"}
                        </strong>
                        <small>
                          {focus && allValued && total > 0
                            ? `${(((focus.value ?? 0) / total) * 100).toFixed(1)}% allocation`
                            : `${sectors.length} sectors`}
                        </small>
                      </div>
                    </div>
                    <div className={styles.legend}>
                      {holdings.length ? (
                        holdings.map((holding, index) => (
                          <button
                            key={holding.asset.address}
                            aria-pressed={selected === holding.asset.address}
                            onClick={() =>
                              setSelected(
                                selected === holding.asset.address
                                  ? null
                                  : holding.asset.address,
                              )
                            }
                          >
                            <i
                              style={{
                                background: colors[index % colors.length],
                              }}
                            />
                            <b>{holding.asset.symbol}</b>
                            <span>
                              {allValued && total > 0
                                ? `${(((holding.value ?? 0) / total) * 100).toFixed(1)}%`
                                : "—"}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p>
                          {account
                            ? wallet
                              ? "Your wallet has no discovered stock tokens yet. Buy a position at the Stock Exchange to bring your first company home."
                              : "Wallet balances are unavailable. Refresh your wallet to review your portfolio."
                            : "Connect your wallet to discover your mainnet stock holdings."}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className={styles.callout}>
                    <ShieldCheck size={20} aria-hidden="true" />
                    <p>
                      {!holdings.length
                        ? "Your portfolio insights will grow with your city."
                        : concentration === null
                          ? "Allocation is unavailable until every holding has an observed token price."
                          : `${holdings[0].asset.symbol} represents ${concentration.toFixed(1)}% of your holdings. ${concentration > 35 ? "A large single position can drive your city’s performance." : "Review sector overlap as well as individual position sizes."}`}
                    </p>
                  </div>
                </>
              )}
            </section>
            <section className={`${styles.card} ${styles.cokoo}`}>
              <div className={styles.sectionTitle}>
                <h4>Cokoo’s workbench</h4>
                <Sparkles size={18} aria-hidden="true" />
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void analyze();
                }}
              >
                <div className={styles.buddy}>
                  <img
                    src="/assets/ai_logo.png"
                    alt=""
                    width={68}
                    height={68}
                  />
                  <p>“Let’s turn the numbers into something you can use.”</p>
                </div>
                <label className={styles.label}>
                  What should I investigate?
                  <textarea
                    autoComplete="off"
                    value={goal}
                    maxLength={350}
                    onChange={(event) => setGoal(event.target.value)}
                    rows={3}
                  />
                </label>
                <button
                  className={styles.primary}
                  type="submit"
                  aria-busy={busy}
                  disabled={busy || !goal.trim() || !wallet}
                >
                  <Sparkles size={16} aria-hidden="true" />
                  {busy ? "Cokoo is reviewing your city…" : "Run AI review"}
                </button>
              </form>
              <div aria-live="polite">
                {busy && (
                  <div className={styles.reviewLoading}>
                    <p className={styles.muted}>
                      Reviewing {pendingContext.toLowerCase()}… This can take up
                      to a minute.
                    </p>
                    <i />
                    <i />
                    <i />
                  </div>
                )}
                {error && (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                )}
                {report && (
                  <div className={styles.report}>
                    <span className={styles.eyebrow}>COKOO’S ASSESSMENT</span>
                    <p className={styles.reportMeta}>
                      {report.context} · Snapshot at {report.time}
                    </p>
                    {report.key !== analysisKey && (
                      <p className={styles.changed}>
                        Inputs changed. Run a new review for this setup.
                      </p>
                    )}
                    {report.text.split(/\n\s*\n/).map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                )}
              </div>
              <p className={styles.muted}>
                Sends your current mainnet holdings and observed token prices to
                the configured AI service. Cokoo explains your snapshot; trades
                require your wallet signature.
              </p>
            </section>
          </div>
          <section className={styles.footer}>
            <div>
              <Activity size={16} aria-hidden="true" />
              <span>
                {wallet
                  ? `${wallet.bnb.formatted} BNB for gas · Wallet updated ${new Date(wallet.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "BNB Smart Chain · Mainnet"}
              </span>
            </div>
            {events.map((event, index) => (
              <p key={`${event}-${index}`}>{event}</p>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
