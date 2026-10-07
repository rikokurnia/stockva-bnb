"use client";

import { useEffect, useRef, useState } from "react";
import { defFor, hasRoad, wholeMoney } from "../lib/city";
import type { CityState, PriceMap } from "../lib/city";
import type { MainnetReceipt, WalletBalances } from "../lib/mainnet";
import styles from "./city-advisor.module.css";

type Message = { role: "guide" | "user"; text: string };

type Props = {
  city: CityState;
  prices: PriceMap;
  walletAddress?: `0x${string}` | null;
  balance?: WalletBalances | null;
  receipts?: MainnetReceipt[];
};

export default function CityAdvisor({
  city,
  walletAddress,
  balance = null,
  receipts = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const accountKey = walletAddress?.toLowerCase() ?? "";
  const currentAccount = useRef(accountKey);
  currentAccount.current = accountKey;
  const wallet =
    balance?.chainId === 56 && balance.account.toLowerCase() === accountKey
      ? balance
      : null;
  const holdings = wallet?.holdings ?? [];
  const valuations = holdings.map((holding) => {
    const observed = holding.asset.priceUsd;
    const price = observed === null ? null : Number(observed);
    const units = Number(holding.formatted);
    return {
      holding,
      units: Number.isFinite(units) ? units : undefined,
      price:
        price !== null && Number.isFinite(price) && price > 0
          ? price
          : undefined,
      value:
        price !== null &&
        Number.isFinite(price) &&
        price > 0 &&
        Number.isFinite(units)
          ? units * price
          : undefined,
    };
  });
  const allValued = valuations.every((item) => item.value !== undefined);
  const total = valuations.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const companyBuildings = city.buildings.filter(
    (building) => defFor(building.kind).ticker && !building.locked,
  );
  const disconnected = city.buildings.filter(
    (building) => !hasRoad(building, city.roads),
  ).length;
  const briefing = !city.roads.length
    ? "A fresh start. Lay your first road."
    : disconnected
      ? `${disconnected} ${disconnected === 1 ? "building needs" : "buildings need"} road access.`
      : !companyBuildings.length
        ? "Roads are ready. Bring your first company home."
        : `${companyBuildings.length} company ${companyBuildings.length === 1 ? "building" : "buildings"} · ${wallet ? (allValued ? wholeMoney(total) + " in stock value." : "Some token prices are unavailable.") : "Connect to see your stock value."}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    generation.current += 1;
    request.current?.abort();
    setMessages([]);
    setDraft("");
    setThinking(false);
  }, [accountKey]);
  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, open, thinking]);

  function localReply(question: string) {
    const q = question.toLowerCase();
    if (/buy|sell|rotate|trade|rebalance|defensive|transaction/.test(q))
      return "Open the Stock Exchange to review a real mainnet buy or sell. Each trade needs a fresh quote, simulation, and your wallet signature. Cokoo helps you understand your portfolio; this chat does not move funds.";
    if (/allocation|portfolio|stock|holding/.test(q)) {
      if (!walletAddress)
        return "Connect your wallet to see your BNB Smart Chain token holdings and USDT balance. Your island layout is saved separately from your funds.";
      if (!wallet)
        return "Your wallet balances are unavailable right now. Refresh your wallet before reviewing allocation; I won’t estimate missing holdings or prices.";
      if (!holdings.length)
        return `Your wallet has no discovered stock tokens and ${wallet.usdt.formatted} USDT. Open the Stock Exchange to explore issuer tokens and review a buy, then place the company beside a road.`;
      if (!allValued)
        return `Your wallet holds ${holdings.length} stock tokens. Some token prices are unavailable, so a complete portfolio value and allocation cannot be calculated. Review your quantities and token contracts in Portfolio.`;
      return `${wholeMoney(total)} in observed stock value. ${valuations
        .slice()
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .slice(0, 8)
        .map(
          ({ holding, value }) =>
            `${holding.asset.symbol}: ${total > 0 ? (((value ?? 0) / total) * 100).toFixed(1) : "0"}%`,
        )
        .join(
          " · ",
        )}. Market observations are indicative; a fresh trade quote determines execution.`;
    }
    if (/expand|next|build|road|review|city/.test(q))
      return `${briefing} ${!city.roads.length ? "Open Build and choose Roads, then draw a connected route on the island." : disconnected ? "Extend a road to disconnected buildings before adding a new block." : "Open the Stock Exchange to review real token holdings. Place a company you own beside a road, or add a free city service."} ${wallet ? `Your wallet has ${wallet.usdt.formatted} USDT.` : "Connect your wallet to load your balances."}`;
    return "Try asking for a city review, your portfolio allocation, or what to build next. I use your current island layout and mainnet wallet snapshot, and leave missing prices unknown.";
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || thinking) return;
    const history = [...messages, { role: "user", text: question } as Message];
    setMessages(history);
    setDraft("");
    input.current?.focus({ preventScroll: true });
    const confirmed = receipts.filter(
      (receipt) =>
        receipt.account.toLowerCase() === accountKey &&
        receipt.asset.chainId === 56 &&
        receipt.status === "FILLED" &&
        receipt.txHash,
    );
    const cash = wallet ? Number(wallet.usdt.formatted) : undefined;
    const snapshot = {
      cash: cash !== undefined && Number.isFinite(cash) ? cash : undefined,
      totalValue: wallet && allValued ? total : undefined,
      walletConnected: !!walletAddress,
      onchainCount: wallet ? holdings.length : undefined,
      holdings: valuations
        .slice(0, 20)
        .map(({ holding, units, price, value }) => ({
          ticker: holding.asset.ticker,
          name: `${holding.asset.name} (${holding.asset.symbol})`,
          units,
          price,
          value,
          onchain: true,
          active: true,
        })),
      marketNote: `BSC mainnet wallet snapshot ${wallet?.fetchedAt ?? "unavailable"}; ${holdings.length} tokens, ${confirmed.length} confirmed app fills. Observed token prices; execution requires a fresh quote. Cost basis unknown.`,
    };

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const requestGeneration = ++generation.current;
    const sentAccount = accountKey;
    const timeout = setTimeout(() => controller.abort(), 55000);
    const isCurrent = () =>
      mounted.current &&
      generation.current === requestGeneration &&
      currentAccount.current === sentAccount;
    setThinking(true);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: history.slice(-6),
          snapshot,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`advisor ${res.status}`);
      const data = (await res.json()) as { reply?: string };
      if (typeof data.reply !== "string" || !data.reply.trim())
        throw new Error("empty reply");
      if (isCurrent())
        setMessages((previous) => [
          ...previous,
          { role: "guide", text: data.reply as string },
        ]);
    } catch {
      if (isCurrent())
        setMessages((previous) => [
          ...previous,
          { role: "guide", text: localReply(question) },
        ]);
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) {
        setThinking(false);
        input.current?.focus({ preventScroll: true });
      }
    }
  }

  return (
    <aside
      className={styles.advisor}
      data-open={open}
      aria-label="cokoo"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      {open && (
        <section
          id="city-advisor-content"
          className={styles.content}
          aria-label="cokoo conversation"
        >
          <header className={styles.heading}>
            <div>
              <span className={styles.eyebrow}>YOUR ISLAND BUDDY</span>
              <h2>Hey, I'm cokoo!</h2>
            </div>
          </header>
          <div
            ref={log}
            className={styles.messages}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            <p className={styles.welcome}>
              Let's grow your island together, one good decision at a time. Ask
              me about your city or your portfolio!
            </p>
            {messages.map((message, index) => (
              <p
                key={index}
                className={
                  message.role === "user" ? styles.user : styles.answer
                }
              >
                <span>{message.role === "user" ? "You" : "cokoo"}</span>
                {message.text}
              </p>
            ))}
            {thinking && (
              <p className={styles.answer}>
                <span>cokoo</span>Thinking…
              </p>
            )}
          </div>
          <div className={styles.prompts} aria-label="Suggested questions">
            {[
              "Review my city",
              "Portfolio allocation",
              "What to build next?",
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => void send(prompt)}
                disabled={thinking}
              >
                {prompt}
              </button>
            ))}
          </div>
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <input
              ref={input}
              value={draft}
              maxLength={500}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Ask cokoo"
              placeholder="Ask cokoo anything…"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!draft.trim() || thinking}
              aria-label="Send message"
            >
              Send
            </button>
          </form>
          <p className={styles.note}>Live insights · Tokenized assets</p>
        </section>
      )}
      <button
        ref={toggle}
        className={styles.capsule}
        aria-expanded={open}
        aria-controls="city-advisor-content"
        onClick={() => setOpen((value) => !value)}
      >
        <img
          src="/assets/ai_logo.png"
          alt=""
          width="64"
          height="64"
          draggable={false}
        />
        <span className={styles.brief}>
          <span className={styles.title}>
            <i />
            cokoo<span>{open ? "Close" : "Ask me"}</span>
          </span>
          <span className={styles.summary}>{briefing}</span>
        </span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
    </aside>
  );
}
