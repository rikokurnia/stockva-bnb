"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  Building2,
  ExternalLink,
  Landmark,
  Minus,
  MousePointer2,
  Plus,
  RefreshCw,
  Route,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import CityMap from "./city-map";
import OnchainWallet from "./onchain-wallet";
import CivicCityHall from "./civic-city-hall";
import MainnetFundingModal from "./mainnet-funding-modal";
import MainnetDialog from "./mainnet-dialog";
import MainnetTrade from "./mainnet-trade";
import TradingChart from "./trading-chart";
import StockLogo from "./stock-logo";
import {
  BSC_CHAIN_ID,
  bscAddressLink,
  bscTxLink,
  type EvmAddress,
  type MainnetAsset,
  type MainnetReceipt,
  type WalletBalances,
  type WalletProvider,
} from "../lib/mainnet";
import {
  getTradingAssets,
  getWalletBalances,
  getTradeStatus,
} from "../lib/trading-client";
import {
  emptyLayout,
  layoutKey,
  mergeReceipt,
  persistReceiptHint,
  readLayout,
  readReceiptHints,
  receiptKey,
  representedCity,
  serializeLayout,
  type MainnetLayout,
} from "../lib/city-mainnet";
import {
  catalogue,
  buildingAt,
  defFor,
  DEFAULT_THRESHOLDS,
  money,
  placementError,
  roadLine,
  validCell,
  type BuildingKind,
  type Cell,
  type PriceMap,
  type Tool,
} from "../lib/city";
import type { HistoryFeed } from "../lib/market";
import styles from "./mainnet-city.module.css";

type Panel =
  "market" | "hall" | "services" | "research" | "advisor" | "help" | null;
export default function MainnetCity() {
  const { wallets } = useWallets();
  const { login } = usePrivy();
  const [account, setAccount] = useState<EvmAddress | null>(null);
  const [assets, setAssets] = useState<MainnetAsset[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [walletBalance, setBalance] = useState<WalletBalances | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [layout, setLayout] = useState<MainnetLayout>(emptyLayout);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<MainnetReceipt[]>([]);
  const [tool, setTool] = useState<Tool>("inspect");
  const [placeKind, setPlaceKind] = useState<BuildingKind | null>(null);
  const [placeAsset, setPlaceAsset] = useState<MainnetAsset | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [motion, setMotion] = useState(true);
  const [grid, setGrid] = useState(false);
  const [cameraReset, setCameraReset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<Panel>(null);
  const [funding, setFunding] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleAssets, setVisibleAssets] = useState(24);
  const [activeAsset, setActiveAsset] = useState<MainnetAsset | null>(null);
  const [trade, setTrade] = useState<{
    asset: MainnetAsset;
    side: "buy" | "sell";
  } | null>(null);
  const [notice, setNotice] = useState(
    "Your island, your wallet. Roads and city services are free.",
  );
  const [chart, setChart] = useState<HistoryFeed | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [advisorQuestion, setAdvisorQuestion] = useState("");
  const [advisorReply, setAdvisorReply] = useState<string | null>(null);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const balance =
    walletBalance?.account.toLowerCase() === account?.toLowerCase()
      ? walletBalance
      : null;
  const activeKey = layoutKey(account);
  const selectedLiveAsset = activeAsset
    ? (assets.find(
        (a) => a.address.toLowerCase() === activeAsset.address.toLowerCase(),
      ) ?? null)
    : null;
  const accountRef = useRef(account);
  accountRef.current = account;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;
  const city = useMemo(
    () =>
      representedCity(
        loadedKey === activeKey ? layout : emptyLayout(),
        balance,
        receipts,
      ),
    [layout, balance, receipts, loadedKey, activeKey],
  );
  const prices: PriceMap = useMemo(() => {
    const map = Object.fromEntries(
      catalogue.filter((d) => d.ticker).map((d) => [d.ticker!, 0]),
    );
    for (const a of assets)
      if (Number(a.priceUsd) > 0 && !map[a.ticker])
        map[a.ticker] = Number(a.priceUsd);
    for (const b of layout.buildings) {
      const a = assets.find(
        (a) => a.address.toLowerCase() === b.tokenAddress?.toLowerCase(),
      );
      if (a) map[a.ticker] = Number(a.priceUsd ?? 0);
    }
    return map;
  }, [assets, layout.buildings]);
  const holdingFor = (asset: MainnetAsset) =>
    balance?.holdings.find(
      (h) => h.asset.address.toLowerCase() === asset.address.toLowerCase(),
    );
  const pending = receipts.some(
    (r) =>
      r.status === "PENDING" &&
      r.account.toLowerCase() === account?.toLowerCase(),
  );
  const selection = city.buildings.find((b) => b.id === selected);
  const selectedAsset = selection
    ? assets.find(
        (a) =>
          a.address.toLowerCase() === selection.tokenAddress?.toLowerCase(),
      )
    : null;
  const knownValues =
    balance?.holdings.map((h) =>
      h.asset.priceUsd === null
        ? null
        : Number(h.formatted) * Number(h.asset.priceUsd),
    ) ?? [];
  const totalStockValue = knownValues.some((v) => v === null)
    ? null
    : knownValues.reduce<number>((n, v) => n + (v ?? 0), 0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    setMotion(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await getTradingAssets();
        if (!cancelled) {
          setAssets(list);
          setAssetError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setAssets([]);
          setAssetError(
            e instanceof Error ? e.message : "Stock catalogue unavailable.",
          );
        }
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    };
    void load();
    const t = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [refresh]);
  useEffect(() => {
    setBalance(null);
    setBalanceError(null);
    setSelected(null);
    setTrade(null);
    let stored: unknown = null;
    try {
      stored = JSON.parse(localStorage.getItem(activeKey) ?? "null");
    } catch {
      /* Invalid layouts start empty. */
    }
    setLayout(readLayout(stored, account));
    setLoadedKey(activeKey);
    setReceipts([]);
    // Stored orders are recovery hints only. Confirmed UI receipts are re-queried from the backend.
    if (account) {
      try {
        const saved = JSON.parse(
          localStorage.getItem(receiptKey(account)) ?? "[]",
        );
        setReceipts(readReceiptHints(saved, account));
      } catch {
        /* No recoverable order history. */
      }
    }
  }, [activeKey, account]);
  useEffect(() => {
    if (!account) return;
    const updated = (event: StorageEvent) => {
      if (event.key !== receiptKey(account)) return;
      try {
        const hints = readReceiptHints(
          JSON.parse(event.newValue ?? "[]"),
          account,
        );
        setReceipts((previous) => {
          let next = previous;
          for (const hint of hints) {
            const known = next.find((r) => r.quoteId === hint.quoteId);
            if (
              !known ||
              (!known.txHash && hint.txHash) ||
              (!known.orderId && hint.orderId)
            )
              next = mergeReceipt(next, hint);
          }
          return next;
        });
      } catch {
        /* Invalid cross-tab hints cannot become confirmed receipts. */
      }
    };
    window.addEventListener("storage", updated);
    return () => window.removeEventListener("storage", updated);
  }, [account]);
  useEffect(() => {
    if (loadedKey === activeKey)
      try {
        localStorage.setItem(
          activeKey,
          JSON.stringify(serializeLayout(layout)),
        );
      } catch {
        setNotice("Your browser could not save the island layout.");
      }
  }, [layout, loadedKey, activeKey]);
  useEffect(() => {
    if (account && loadedKey === activeKey)
      try {
        localStorage.setItem(receiptKey(account), JSON.stringify(receipts));
      } catch {
        setNotice(
          "Order recovery could not be saved. Keep your transaction hashes.",
        );
      }
  }, [receipts, account, loadedKey, activeKey]);
  useEffect(() => {
    if (!account) return;
    let cancelled = false,
      running = false;
    const load = async () => {
      if (running) return;
      running = true;
      setBalanceLoading(true);
      try {
        const result = await getWalletBalances(account);
        if (!cancelled) {
          setBalance(result);
          setBalanceError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setBalance(null);
          setBalanceError(
            e instanceof Error ? e.message : "Mainnet balances unavailable.",
          );
        }
      } finally {
        running = false;
        if (!cancelled) setBalanceLoading(false);
      }
    };
    void load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [account, refresh]);
  useEffect(() => {
    if (!account) return;
    let cancelled = false,
      checking = false;
    const reconcile = async () => {
      if (checking) return;
      checking = true;
      for (const r of receiptsRef.current.filter(
        (r) => r.status === "PENDING",
      )) {
        try {
          const result = await getTradeStatus(
            r.quoteId,
            r.recoveryToken,
            r.txHash ?? undefined,
          );
          if (
            !cancelled &&
            result.account.toLowerCase() === account.toLowerCase()
          ) {
            setReceipts((prev) => mergeReceipt(prev, result));
            if (result.status === "FILLED") setRefresh((n) => n + 1);
          }
        } catch (e) {
          if (!cancelled)
            setReceipts((prev) =>
              mergeReceipt(prev, {
                ...r,
                error:
                  e instanceof Error
                    ? e.message
                    : "Order status unavailable. Check its transaction on BscScan.",
              }),
            );
        }
      }
      checking = false;
    };
    void reconcile();
    const t = setInterval(reconcile, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [account, receipts.length]);
  useEffect(() => {
    if (panel !== "research" || !activeAsset) return;
    const controller = new AbortController();
    setChart(null);
    setChartError(null);
    fetch(
      `/api/history?ticker=${encodeURIComponent(activeAsset.ticker)}&contract=${encodeURIComponent(activeAsset.address)}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error ?? "Price history unavailable.");
        if (!controller.signal.aborted) setChart(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setChartError(
            e instanceof Error ? e.message : "Price history unavailable.",
          );
      });
    return () => controller.abort();
  }, [panel, activeAsset]);
  const connect = () => {
    setPanel(null);
    login({ loginMethods: ["wallet"] });
  };
  const getProvider = async (): Promise<WalletProvider> => {
    const connected = wallets.find(
      (w) => w.address.toLowerCase() === accountRef.current?.toLowerCase(),
    );
    if (!connected) throw Error("Connect the same wallet before signing.");
    return connected.getEthereumProvider();
  };
  const recordReceipt = useCallback((receipt: MainnetReceipt) => {
    try {
      persistReceiptHint(localStorage, receipt);
    } catch {
      setNotice(
        "Order recovery could not be saved. Keep your transaction hashes.",
      );
    }
    if (receipt.account.toLowerCase() !== accountRef.current?.toLowerCase())
      return;
    setReceipts((prev) => mergeReceipt(prev, receipt));
    if (receipt.status === "FILLED") {
      setRefresh((n) => n + 1);
      setNotice(
        `${receipt.side === "buy" ? "Purchase" : "Sale"} confirmed on BSC mainnet. Refreshing your wallet.`,
      );
    }
  }, []);
  const openTrade = (asset: MainnetAsset, side: "buy" | "sell") => {
    if (!account) {
      setPanel(null);
      setFunding(true);
      return;
    }
    if (pending) {
      setPanel("hall");
      setNotice(
        "Resolve the pending order in City Hall before starting another trade.",
      );
      return;
    }
    setPanel(null);
    setTrade({ asset, side });
  };
  const startPlace = (asset: MainnetAsset) => {
    const holding = holdingFor(asset);
    if (!account || !holding || BigInt(holding.raw) <= 0n) {
      openTrade(asset, "buy");
      return;
    }
    const def = catalogue.find((d) => d.ticker === asset.ticker);
    if (!def) {
      setNotice(
        "This token is shown in your wallet. A matching building is not available yet.",
      );
      return;
    }
    if (
      layout.buildings.some(
        (b) => b.tokenAddress?.toLowerCase() === asset.address.toLowerCase(),
      )
    ) {
      setNotice("This wallet holding already has a building.");
      return;
    }
    if (layout.buildings.some((b) => b.kind === def.kind)) {
      setNotice(
        "This company already has a building for another issuer token. Remove that visual building to switch issuer.",
      );
      return;
    }
    setPlaceKind(def.kind);
    setPlaceAsset(asset);
    setTool("build");
    setPanel(null);
    setNotice(
      `Choose a location for ${asset.symbol}. Placement is free and does not trade.`,
    );
  };
  const cancelPlacement = () => {
    setTool("inspect");
    setPlaceKind(null);
    setPlaceAsset(null);
  };
  const place = (cell: Cell) => {
    if (!placeKind) return;
    const error = placementError(cell, city);
    if (error) {
      setNotice(error);
      return;
    }
    if (
      placeAsset &&
      (!account || !holdingFor(placeAsset) || !balanceRef.current)
    ) {
      setNotice("Refresh your wallet holding before placing this company.");
      return;
    }
    setLayout((prev) =>
      prev.buildings.some(
        (b) =>
          b.kind === placeKind ||
          (placeAsset &&
            b.tokenAddress?.toLowerCase() === placeAsset.address.toLowerCase()),
      )
        ? prev
        : {
            ...prev,
            buildings: [
              ...prev.buildings,
              {
                ...cell,
                id: crypto.randomUUID(),
                kind: placeKind,
                quantity: 0,
                entry: 0,
                cost: 0,
                builtAt: Date.now(),
                ...(placeAsset
                  ? {
                      tokenAddress: placeAsset.address,
                      tokenDecimals: placeAsset.decimals,
                      owner: account!,
                    }
                  : {}),
              },
            ],
          },
    );
    cancelPlacement();
    setNotice("Building placed. Your wallet balance is unchanged.");
  };
  const drawRoad = (cells: Cell[]) => {
    if (cells.some((c) => !validCell(c) || buildingAt(c, city))) {
      setNotice("Keep roads on the island and clear of buildings.");
      return;
    }
    setLayout((prev) => ({
      ...prev,
      roads: [
        ...prev.roads,
        ...cells.filter(
          (c) => !prev.roads.some((r) => r.r === c.r && r.c === c.c),
        ),
      ],
    }));
  };
  const remove = (cell: Cell) => {
    const b = buildingAt(cell, city);
    setLayout((prev) => ({
      ...prev,
      buildings: b
        ? prev.buildings.filter((row) => row.id !== b.id)
        : prev.buildings,
      roads: b
        ? prev.roads
        : prev.roads.filter((r) => r.r !== cell.r || r.c !== cell.c),
    }));
    setSelected(null);
    setNotice(
      b
        ? "Visual building removed. Your tokens remain in your wallet."
        : "Road removed.",
    );
  };
  const select = (id: string | null) => {
    setSelected(id);
    const b = city.buildings.find((b) => b.id === id);
    if (!b) return;
    const actions: Partial<Record<BuildingKind, Panel>> = {
      exchange: "market",
      hall: "hall",
      agent_hall: "advisor",
      oracle: "market",
    };
    if (actions[b.kind]) setPanel(actions[b.kind]!);
  };
  const askAdvisor = async () => {
    if (!advisorQuestion.trim() || advisorBusy) return;
    setAdvisorBusy(true);
    setAdvisorError(null);
    setAdvisorReply(null);
    const owner = account;
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: advisorQuestion,
          snapshot: {
            cash: balance ? Number(balance.usdt.formatted) : undefined,
            totalValue: totalStockValue ?? undefined,
            walletConnected: !!balance,
            onchainCount: balance?.holdings.length ?? 0,
            marketNote:
              "BSC mainnet direct-wallet holdings. Prices may be unavailable. This advisor cannot trade or schedule orders.",
            holdings:
              balance?.holdings.map((h) => ({
                ticker: h.asset.ticker,
                name: h.asset.name,
                units: Number(h.formatted),
                price: h.asset.priceUsd ? Number(h.asset.priceUsd) : undefined,
                value: h.asset.priceUsd
                  ? Number(h.formatted) * Number(h.asset.priceUsd)
                  : undefined,
                onchain: true,
                active: true,
              })) ?? [],
          },
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Advisor unavailable.");
      if (accountRef.current === owner)
        setAdvisorReply(data.reply ?? data.message ?? "No response returned.");
    } catch (e) {
      setAdvisorError(e instanceof Error ? e.message : "Advisor unavailable.");
    } finally {
      setAdvisorBusy(false);
    }
  };
  const filteredAssets = assets.filter((a) =>
    `${a.ticker} ${a.symbol} ${a.name} ${a.platform}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <main className={`simcity ${styles.shell}`}>
      <CityMap
        freePlacement
        city={city}
        tool={tool}
        kind={placeKind}
        amount={0}
        selected={selected}
        moving={null}
        zoom={zoom}
        cameraReset={cameraReset}
        grid={grid}
        portfolioView={false}
        motion={motion}
        paused={false}
        speed={1}
        prices={prices}
        thresholds={DEFAULT_THRESHOLDS}
        simulationReturns={null}
        now={now}
        upgrades={{}}
        onZoom={(d) => setZoom((z) => Math.max(0.5, Math.min(2, z + d)))}
        onSelect={select}
        onPlace={place}
        onRoad={drawRoad}
        onBulldoze={remove}
        onCancel={cancelPlacement}
        onHover={() => {}}
      />
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <img src="/assets/ai_logo.png" alt="Stockva" />
          STOCKVA
        </a>
        <span
          className={styles.network}
          title="BNB Smart Chain mainnet · chain 56"
        >
          <i /> <span className={styles.networkFull}>BNB SMART CHAIN · 56</span>
          <span className={styles.networkShort}>BSC · 56</span>
        </span>
        <div className={styles.topActions}>
          <button onClick={() => setFunding(true)} aria-label="Fund wallet">
            <Wallet size={15} />
            <span>Fund wallet</span>
          </button>
          <OnchainWallet address={account} onChange={setAccount} />
        </div>
      </header>
      <section className={styles.walletSummary} aria-label="Wallet overview">
        <small>YOUR WALLET</small>
        <strong>
          {account
            ? balanceError
              ? "Unavailable"
              : balance
                ? `${Number(balance.usdt.formatted).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`
                : "Reading balances…"
            : "Connect to begin"}
        </strong>
        <p>
          {balance && !balanceError
            ? `${Number(balance.bnb.formatted).toLocaleString(undefined, { maximumFractionDigits: 8 })} BNB for gas`
            : "BSC mainnet · assets stay in your wallet"}
        </p>
        <div>
          <span>Stock value</span>
          <b>
            {!balance || totalStockValue === null
              ? "—"
              : money(totalStockValue)}
          </b>
          <button
            onClick={() => setRefresh((n) => n + 1)}
            disabled={balanceLoading}
            aria-label="Refresh mainnet balances"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        {balanceError && (
          <p className={styles.error} role="alert">
            {balanceError}
          </p>
        )}
        {pending && (
          <button className={styles.warning} onClick={() => setPanel("hall")}>
            An order needs confirmation →
          </button>
        )}
      </section>
      <nav className={styles.toolbar} aria-label="City tools">
        <button
          aria-label="Inspect"
          className={tool === "inspect" ? styles.active : ""}
          onClick={cancelPlacement}
        >
          <MousePointer2 size={19} />
          <span>Inspect</span>
        </button>
        <button
          aria-label="Stocks"
          onClick={() => {
            cancelPlacement();
            setPanel("market");
          }}
        >
          <Building2 size={19} />
          <span>Stocks</span>
        </button>
        <button
          aria-label="Roads"
          className={tool === "road" ? styles.active : ""}
          onClick={() => {
            setTool("road");
            setPlaceKind(null);
            setNotice("Drag on the island to draw free roads.");
          }}
        >
          <Route size={19} />
          <span>Roads</span>
        </button>
        <button onClick={() => setPanel("services")} aria-label="Services">
          <Landmark size={19} />
          <span>Services</span>
        </button>
        <button
          aria-label="Remove"
          className={tool === "bulldoze" ? styles.active : ""}
          onClick={() => {
            setTool("bulldoze");
            setNotice(
              "Remove roads and visual buildings. This does not sell tokens.",
            );
          }}
        >
          <Trash2 size={19} />
          <span>Remove</span>
        </button>
      </nav>
      <div className={styles.bottomBar}>
        <p role="status">{notice}</p>
        <div>
          <button onClick={() => setPanel("hall")}>City Hall</button>
          <button onClick={() => setPanel("advisor")}>Cokoo advisor</button>
          <button onClick={() => setPanel("help")}>Help</button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            aria-label="Zoom out"
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            aria-label="Zoom in"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      {selection && !panel && !trade && (
        <aside className={styles.inspector}>
          <button
            className={styles.inspectorClose}
            onClick={() => setSelected(null)}
            aria-label="Close building inspector"
          >
            <X size={16} />
          </button>
          <small>
            {selectedAsset
              ? `${selectedAsset.platform} · ${selectedAsset.symbol}`
              : "CITY SERVICE"}
          </small>
          <h3>{defFor(selection.kind).name}</h3>
          {selectedAsset ? (
            <>
              <p>
                {balance
                  ? `${holdingFor(selectedAsset)?.formatted ?? "0"} ${selectedAsset.symbol}`
                  : "Wallet balance unavailable"}
              </p>
              <strong>
                {selectedAsset.priceUsd !== null && balance
                  ? money(selection.quantity * Number(selectedAsset.priceUsd))
                  : "Price unavailable"}
              </strong>
              <p className={styles.muted}>
                {selection.entry
                  ? `Entry ${money(selection.entry)} per token from confirmed purchases`
                  : "Cost basis unavailable"}
              </p>
              <div className={styles.buttonRow}>
                <button
                  className={styles.primary}
                  disabled={!balance || pending}
                  onClick={() => openTrade(selectedAsset, "buy")}
                >
                  Buy more
                </button>
                <button
                  className={styles.secondary}
                  disabled={!balance || selection.quantity <= 0 || pending}
                  onClick={() => openTrade(selectedAsset, "sell")}
                >
                  Sell
                </button>
              </div>
              <button
                onClick={() => {
                  setActiveAsset(selectedAsset);
                  setPanel("research");
                }}
              >
                Token details & history
              </button>
            </>
          ) : (
            <p>{defFor(selection.kind).description}</p>
          )}
          <button onClick={() => remove(selection)}>
            Remove visual building
          </button>
        </aside>
      )}
      {panel && (
        <MainnetDialog
          title={
            panel === "market"
              ? "Stock Exchange"
              : panel === "hall"
                ? "City Hall"
                : panel === "services"
                  ? "City services"
                  : panel === "research"
                    ? `${activeAsset?.symbol ?? "Token"} details`
                    : panel === "advisor"
                      ? "Cokoo portfolio advisor"
                      : "Your mainnet city"
          }
          onClose={() => setPanel(null)}
        >
          {panel === "market" && (
            <>
              <p className={styles.muted}>
                Choose an issuer token on BSC. Prices are market observations;
                each trade gets a fresh executable quote.
              </p>
              <label className={styles.search}>
                <Search size={16} />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setVisibleAssets(24);
                  }}
                  placeholder="Search company, ticker or issuer"
                  aria-label="Search stock tokens"
                />
              </label>
              {assetError && (
                <p className={styles.error} role="alert">
                  {assetError}
                </p>
              )}
              {assetsLoading && <p>Loading mainnet issuer tokens…</p>}
              <div className={styles.assets}>
                {filteredAssets.slice(0, visibleAssets).map((asset) => {
                  const holding = holdingFor(asset);
                  const represented = layout.buildings.some(
                    (b) =>
                      b.tokenAddress?.toLowerCase() ===
                      asset.address.toLowerCase(),
                  );
                  return (
                    <article className={styles.assetCard} key={asset.address}>
                      <div className={styles.assetTitle}>
                        <StockLogo
                          ticker={asset.ticker}
                          name={asset.name}
                          size={32}
                        />
                        <div>
                          <h3>{asset.symbol}</h3>
                          <small>
                            {asset.name} · {asset.platform}
                          </small>
                        </div>
                        <strong>
                          {asset.priceUsd === null
                            ? "—"
                            : money(Number(asset.priceUsd))}
                        </strong>
                      </div>
                      <p className={styles.muted}>
                        {holding
                          ? `Held: ${holding.formatted} ${asset.symbol}`
                          : "No wallet holding detected"}
                      </p>
                      <small className={styles.muted}>
                        {asset.priceUpdatedAt
                          ? `Observed ${new Date(asset.priceUpdatedAt).toLocaleTimeString()}${Date.now() - Date.parse(asset.priceUpdatedAt) > 120000 ? " · stale" : ""}`
                          : "Price timestamp unavailable"}
                      </small>
                      <div className={styles.buttonRow}>
                        <button
                          className={styles.primary}
                          onClick={() => openTrade(asset, "buy")}
                          disabled={pending}
                        >
                          Buy
                        </button>
                        <button
                          className={styles.secondary}
                          onClick={() => openTrade(asset, "sell")}
                          disabled={
                            !holding || BigInt(holding.raw) <= 0n || pending
                          }
                        >
                          Sell
                        </button>
                        <button
                          onClick={() => {
                            setActiveAsset(asset);
                            setPanel("research");
                          }}
                        >
                          Details
                        </button>
                        {holding &&
                          catalogue.some((d) => d.ticker === asset.ticker) && (
                            <button
                              onClick={() => startPlace(asset)}
                              disabled={represented}
                            >
                              {represented ? "In city" : "Place building"}
                            </button>
                          )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {filteredAssets.length > visibleAssets && (
                <button
                  className={styles.secondary}
                  onClick={() => setVisibleAssets((n) => n + 24)}
                >
                  Show more tokens (
                  {Math.min(visibleAssets, filteredAssets.length)} of{" "}
                  {filteredAssets.length})
                </button>
              )}
              {!assetsLoading && !assetError && !filteredAssets.length && (
                <p>No matching BSC issuer tokens.</p>
              )}
            </>
          )}
          {panel === "hall" && (
            <CivicCityHall
              walletAddress={account}
              balance={balance}
              balanceLoading={balanceLoading}
              balanceError={balanceError}
              receipts={receipts}
              onRefresh={() => setRefresh((n) => n + 1)}
              onConnectWallet={async () => {
                connect();
                if (!account)
                  throw Error(
                    "Finish connecting your wallet in the wallet dialog.",
                  );
                return account;
              }}
              onFocusTicker={(ticker) => {
                setSearch(ticker);
                setPanel("market");
              }}
            />
          )}
          {panel === "services" && (
            <>
              <p className={styles.muted}>
                Services are free city features. They never spend wallet funds.
              </p>
              <div className={styles.assets}>
                {catalogue
                  .filter((d) => d.category === "services")
                  .map((d) => (
                    <article className={styles.assetCard} key={d.kind}>
                      <h3>{d.name}</h3>
                      <p>{d.description}</p>
                      <button
                        className={styles.primary}
                        disabled={layout.buildings.some(
                          (b) => b.kind === d.kind,
                        )}
                        onClick={() => {
                          setPlaceAsset(null);
                          setPlaceKind(d.kind);
                          setTool("build");
                          setPanel(null);
                          setNotice(`Place ${d.name} on your island. Free.`);
                        }}
                      >
                        {layout.buildings.some((b) => b.kind === d.kind)
                          ? "Placed"
                          : "Place for free"}
                      </button>
                    </article>
                  ))}
              </div>
            </>
          )}
          {panel === "research" && selectedLiveAsset && (
            <>
              <div className={styles.tradeIdentity}>
                <strong>{selectedLiveAsset.name}</strong>
                <span>
                  {selectedLiveAsset.symbol} · {selectedLiveAsset.platform} ·
                  BSC mainnet
                </span>
                <a
                  href={bscAddressLink(selectedLiveAsset.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selectedLiveAsset.address} <ExternalLink size={12} />
                </a>
              </div>
              <dl className={styles.quote}>
                <div>
                  <dt>Observed token price</dt>
                  <dd>
                    {selectedLiveAsset.priceUsd === null
                      ? "Unavailable"
                      : money(Number(selectedLiveAsset.priceUsd))}
                  </dd>
                </div>
                <div>
                  <dt>Underlying reference</dt>
                  <dd>
                    {selectedLiveAsset.referencePriceUsd === null
                      ? "Unavailable"
                      : money(Number(selectedLiveAsset.referencePriceUsd))}
                  </dd>
                </div>
                <div>
                  <dt>Token-to-share ratio</dt>
                  <dd>
                    {selectedLiveAsset.tokenToShareRatio ?? "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt>Observation time</dt>
                  <dd>
                    {selectedLiveAsset.priceUpdatedAt
                      ? new Date(
                          selectedLiveAsset.priceUpdatedAt,
                        ).toLocaleString()
                      : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt>Provider market status</dt>
                  <dd>{selectedLiveAsset.marketStatus ?? "Unknown"}</dd>
                </div>
              </dl>
              <p className={styles.muted}>
                An issuer token has its own terms and eligibility rules. Holding
                it does not automatically provide shareholder rights.
                Availability is checked when requesting a quote.
              </p>
              {chartError && <p className={styles.error}>{chartError}</p>}
              {chart && (
                <TradingChart
                  points={chart.points}
                  ticker={selectedLiveAsset.ticker}
                  contract={selectedLiveAsset.address}
                  tokenName={selectedLiveAsset.symbol}
                  livePrice={
                    selectedLiveAsset.priceUsd
                      ? Number(selectedLiveAsset.priceUsd)
                      : undefined
                  }
                />
              )}
              <button
                className={styles.primary}
                disabled={pending}
                onClick={() => openTrade(selectedLiveAsset, "buy")}
              >
                Review a buy quote
              </button>
            </>
          )}
          {panel === "advisor" && (
            <>
              <p className={styles.muted}>
                Ask about your actual wallet allocation and observed stock
                prices. Cokoo provides analysis; trades require your separate
                review and wallet signature.
              </p>
              <label className={styles.inputLabel}>
                Question
                <textarea
                  value={advisorQuestion}
                  onChange={(e) => setAdvisorQuestion(e.target.value)}
                  maxLength={500}
                  placeholder="Review my portfolio allocation"
                />
              </label>
              <button
                className={styles.primary}
                onClick={askAdvisor}
                disabled={advisorBusy || !advisorQuestion.trim()}
              >
                {advisorBusy ? "Reviewing…" : "Ask Cokoo"}
              </button>
              {advisorReply && (
                <p className={styles.advisorReply}>{advisorReply}</p>
              )}
              {advisorError && (
                <p className={styles.error} role="alert">
                  {advisorError}
                </p>
              )}
            </>
          )}
          {panel === "help" && (
            <>
              <p>
                Connect a wallet, fund it with USDT and BNB on BNB Smart Chain,
                and review a small stock-token purchase in the Exchange. After
                confirmation, place its building on the island. Selling returns
                USDT directly to the same wallet.
              </p>
              <p>
                Draw roads by dragging on the island. Services and roads are
                free. Removing a building only changes your island layout. Every
                issuer token has its own contract and trading availability.
              </p>
              <div className={styles.buttonRow}>
                <button onClick={() => setGrid((g) => !g)}>
                  Grid: {grid ? "on" : "off"}
                </button>
                <button onClick={() => setMotion((m) => !m)}>
                  Motion: {motion ? "on" : "off"}
                </button>
                <button
                  onClick={() => {
                    setCameraReset((n) => n + 1);
                    setZoom(1);
                  }}
                >
                  Reset camera
                </button>
              </div>
            </>
          )}
        </MainnetDialog>
      )}
      {trade && account && (
        <MainnetTrade
          key={`${account}:${trade.asset.address}:${trade.side}`}
          asset={trade.asset}
          side={trade.side}
          account={account}
          holding={holdingFor(trade.asset)?.formatted ?? "0"}
          balance={balance}
          getProvider={getProvider}
          onReceipt={recordReceipt}
          onClose={() => {
            setTrade(null);
            setPanel("hall");
          }}
        />
      )}
      <MainnetFundingModal
        open={funding}
        onClose={() => setFunding(false)}
        walletAddress={account}
        onWalletConnected={setAccount}
        onRefresh={() => setRefresh((n) => n + 1)}
      />
    </main>
  );
}
