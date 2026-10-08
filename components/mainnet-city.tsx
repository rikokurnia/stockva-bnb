"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  HelpCircle,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Route,
  Trash2,
  X,
} from "lucide-react";
import CityMap from "./city-map";
import OnchainWallet from "./onchain-wallet";
import CivicPanel from "./civic-panel";
import { MainnetCatalogue } from "./mainnet-catalogue";
import CityAdvisor from "./city-advisor";
import MainnetAgentHall from "./mainnet-agent-hall";
import CompanyIntel from "./company-intel";
import portfolioStyles from "./portfolio-view.module.css";
import MainnetFundingModal from "./mainnet-funding-modal";
import MainnetDialog from "./mainnet-dialog";
import MainnetTrade from "./mainnet-trade";

import {
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
  buildingImage,
  hasRoad,
  sprite,
  type Building,
  type Category,
  placementError,
  validCell,
  type BuildingKind,
  type Cell,
  type PriceMap,
  type Tool,
} from "../lib/city";
import type { Quote } from "../lib/market";
import styles from "./mainnet-city.module.css";

type Panel =
  "market" | "hall" | "research" | "advisor" | "settings" | "help" | null;
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
  const [category, setCategory] = useState<Category | null>(null);
  const [lastCategory, setLastCategory] = useState<Category>("companies");
  const [portfolioView, setPortfolioView] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [guideHidden, setGuideHidden] = useState(false);
  const [booted, setBooted] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{
    r: number;
    c: number;
    nonce: number;
  } | null>(null);
  const [intelId, setIntelId] = useState<string | null>(null);
  const [inspectorStyle, setInspectorStyle] = useState<
    React.CSSProperties | undefined
  >();
  const utilityPanel = useRef<HTMLElement>(null);
  const inspectorDrag = useRef<{ dx: number; dy: number } | null>(null);
  const history = useRef<MainnetLayout[]>([]);
  const future = useRef<MainnetLayout[]>([]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [activeAsset, setActiveAsset] = useState<MainnetAsset | null>(null);
  const [trade, setTrade] = useState<{
    asset: MainnetAsset;
    side: "buy" | "sell";
    amount?: string;
  } | null>(null);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [notice, setNotice] = useState(
    "Your island, your wallet. Roads and city services are free.",
  );
  const balance =
    walletBalance?.account.toLowerCase() === account?.toLowerCase()
      ? walletBalance
      : null;
  const activeKey = layoutKey(account);
  const accountRef = useRef(account);
  accountRef.current = account;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;
  const city = useMemo(
    () =>
      // App receipts do not prove complete wallet history or a holding's cost basis.
      representedCity(
        loadedKey === activeKey ? layout : emptyLayout(),
        balance,
      ),
    [layout, balance, loadedKey, activeKey],
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
    let cancelled = false,
      running = false;
    const load = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
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
        running = false;
        if (!cancelled) setAssetsLoading(false);
      }
    };
    void load();
    const t = setInterval(load, 15000);
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
    setIntelId(null);
    setMoving(null);
    setScanMode(false);
    setScanTarget(null);
    setConfirmReset(false);
    setPlaceAsset(null);
    setPlaceKind(null);
    setTool("inspect");
    history.current = [];
    future.current = [];
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
  const connect = () => {
    setPanel(null);
    setCategory(null);
    setIntelId(null);
    setFunding(false);
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
  const openTrade = (
    asset: MainnetAsset,
    side: "buy" | "sell",
    amount?: string,
  ) => {
    setCategory(null);
    setIntelId(null);
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
    setTrade({ asset, side, amount });
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
    setCategory(null);
    setIntelId(null);
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
    setMoving(null);
  };
  const place = (cell: Cell) => {
    if (!placeKind) return;
    if (moving) {
      const building = layout.buildings.find((b) => b.id === moving);
      if (!building) return;
      const error = placementError(cell, {
        ...city,
        buildings: city.buildings.filter((b) => b.id !== moving),
      });
      if (error) {
        setNotice(error);
        return;
      }
      commitLayout({
        ...layout,
        buildings: layout.buildings.map((b) =>
          b.id === moving ? { ...b, ...cell } : b,
        ),
      });
      cancelPlacement();
      setNotice("Building moved. Your wallet balance is unchanged.");
      return;
    }
    const error = placementError(cell, city);
    if (error) {
      setNotice(error);
      return;
    }
    if (
      placeAsset &&
      (!account ||
        !holdingFor(placeAsset) ||
        BigInt(holdingFor(placeAsset)?.raw ?? "0") <= 0n ||
        !balanceRef.current)
    ) {
      setNotice("Refresh your wallet holding before placing this company.");
      return;
    }
    commitLayout((prev) =>
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
    commitLayout((prev) => ({
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
    commitLayout((prev) => ({
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
      oracle: "research",
    };
    if (scanMode && defFor(b.kind).ticker) {
      setScanTarget(id);
      return;
    }
    if (actions[b.kind]) {
      setCategory(null);
      setIntelId(null);
      setPanel(actions[b.kind]!);
    } else if (defFor(b.kind).ticker) {
      setPanel(null);
      setIntelId(b.id);
    } else setPanel(null);
  };
  const commitLayout = (
    next: MainnetLayout | ((previous: MainnetLayout) => MainnetLayout),
  ) => {
    if (loadedKey !== activeKey) return;
    const previous = layoutRef.current;
    const value = typeof next === "function" ? next(previous) : next;
    if (value === previous) return;
    history.current = [...history.current.slice(-29), previous];
    future.current = [];
    layoutRef.current = value;
    setLayout(value);
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(layoutRef.current);
    layoutRef.current = previous;
    setLayout(previous);
    setNotice("Layout change undone. Wallet holdings are unchanged.");
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(layoutRef.current);
    layoutRef.current = next;
    setLayout(next);
  };
  const chooseCategory = (next: Category) => {
    cancelPlacement();
    setLastCategory(next);
    setCategory(next);
    setPanel(null);
    setIntelId(null);
    setSelected(null);
    setPortfolioView(false);
  };
  const chooseRoad = () => {
    cancelPlacement();
    setTool("road");
    setCategory(null);
    setPanel(null);
    setNotice(
      "Drawing free roads. Drag a route on the island; Escape finishes.",
    );
  };
  const placeService = (kind: BuildingKind) => {
    if (layout.buildings.some((b) => b.kind === kind)) return;
    cancelPlacement();
    setCategory(null);
    setPanel(null);
    setPlaceKind(kind);
    setTool("build");
    setNotice(`Place ${defFor(kind).name} on your island. Free.`);
  };
  const openPanel = (next: Panel) => {
    setCategory(null);
    setIntelId(null);
    cancelPlacement();
    setPanel(next);
  };
  const toggleSelectPortfolio = () => {
    cancelPlacement();
    setCategory(null);
    setSelected(null);
    setIntelId(null);
    setPanel(null);
    setPortfolioView((value) => !value);
  };
  const focusBuilding = (building: Building) => {
    openPanel(null);
    setSelected(building.id);
    setZoom(1.7);
    setFocusTarget({ r: building.r, c: building.c, nonce: Date.now() });
  };
  const intelBuilding = city.buildings.find(
    (b) => b.id === intelId && defFor(b.kind).ticker,
  );
  const intelAsset = assets.find(
    (a) =>
      a.address.toLowerCase() === intelBuilding?.tokenAddress?.toLowerCase(),
  );
  const observation = (asset: MainnetAsset | undefined): Quote | undefined =>
    asset
      ? {
          ticker: asset.ticker,
          price: Number(asset.priceUsd ?? 0),
          change: 0,
          changeAvailable: false,
          source: "Binance Web3 · BSC token observation",
          status:
            asset.priceUsd === null
              ? "unavailable"
              : !asset.priceUpdatedAt ||
                  !Number.isFinite(Date.parse(asset.priceUpdatedAt)) ||
                  Date.now() - Date.parse(asset.priceUpdatedAt) > 120000
                ? "stale"
                : "live",
          fetchedAt: asset.priceUpdatedAt,
          contract: asset.address,
          tokenName: asset.symbol,
          platform: asset.platform,
          chainId: 56,
        }
      : undefined;
  const scanBuilding = city.buildings.find((b) => b.id === scanTarget);
  const scanAsset = assets.find(
    (a) =>
      a.address.toLowerCase() === scanBuilding?.tokenAddress?.toLowerCase(),
  );
  const builtKinds = new Set(layout.buildings.map((b) => b.kind));
  const hasHall = layout.buildings.some((b) => b.kind === "hall");
  const steps = [
    city.roads.length > 0,
    city.buildings.some((b) => b.kind === "exchange"),
    city.buildings.some((b) => defFor(b.kind).ticker && !b.locked),
  ];
  useEffect(() => {
    if (
      notice === "Your island, your wallet. Roads and city services are free."
    )
      return;
    setNoticeVisible(true);
    const timer = setTimeout(() => setNoticeVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (panel !== "settings" && panel !== "help") return;
    const previous = document.activeElement as HTMLElement | null;
    utilityPanel.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [panel]);
  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), 650);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.closest(
          "input, textarea, select, [contenteditable=true], [role=dialog]",
        )
      )
        return;
      if (trade || funding || category || intelId || panel || confirmReset)
        return;
      const k = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && k === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (k === "escape") {
        cancelPlacement();
        setSelected(null);
        setScanMode(false);
      } else if (k === "b") chooseCategory(lastCategory);
      else if (k === "s") chooseCategory("services");
      else if (k === "r") chooseRoad();
      else if (k === "v") toggleSelectPortfolio();
      else if (k === "x") {
        cancelPlacement();
        setTool("bulldoze");
        setNotice(
          "Remove visual buildings and roads. Tokens stay in your wallet.",
        );
      } else if (k === "g") setGrid((value) => !value);
      else if (k === "+" || k === "=") setZoom((z) => Math.min(2, z + 0.1));
      else if (k === "-") setZoom((z) => Math.max(0.5, z - 0.1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <main className={`simcity ${category ? "tray-open" : ""}`}>
      {!booted && (
        <div className="boot-overlay" aria-label="Loading Stockva">
          <video
            className="boot-video"
            src="/assets/background-main.mp4"
            poster="/assets/background.png"
            muted
            autoPlay
            loop
            playsInline
          />
          <div className="boot-card">
            <span className="boot-kicker">STOCKVA · BNB SMART CHAIN</span>
            <strong>Opening your island…</strong>
            <small>
              Your city layout saves here. Holdings come from your wallet.
            </small>
          </div>
        </div>
      )}
      <CityMap
        freePlacement
        city={city}
        tool={tool}
        kind={placeKind}
        amount={0}
        selected={selected}
        moving={moving}
        zoom={zoom}
        cameraReset={cameraReset}
        focusTarget={focusTarget}
        scanMode={scanMode}
        scanTarget={scanTarget}
        onScanTarget={setScanTarget}
        grid={grid || portfolioView}
        portfolioView={portfolioView}
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
      {intelBuilding && !panel && !trade && (
        <CompanyIntel
          building={intelBuilding}
          prices={prices}
          quote={observation(intelAsset)}
          mainnetAsset={intelAsset}
          onRemove={() => {
            remove(intelBuilding);
            setIntelId(null);
          }}
          thresholds={DEFAULT_THRESHOLDS}
          running={false}
          hasExchange={true}
          hasData={true}
          onClose={() => {
            setIntelId(null);
            setSelected(null);
          }}
          onTrade={() => {
            setActiveAsset(intelAsset ?? null);
            openPanel("market");
          }}
          onPassport={() => {
            setActiveAsset(intelAsset ?? null);
            openPanel("research");
          }}
          onMove={() => {
            setIntelId(null);
            setMoving(intelBuilding.id);
            setPlaceKind(intelBuilding.kind);
            setTool("move");
            setCategory(null);
            setNotice("Choose an empty plot. Escape cancels.");
          }}
        />
      )}
      {portfolioView && (
        <div className={portfolioStyles.heading} role="status">
          <h2>Portfolio view</h2>
          <p>
            {balance
              ? "BSC wallet holdings · issuer-token observations"
              : "Connect a wallet to view your holdings"}
          </p>
          <p>Select returns to your city</p>
        </div>
      )}
      <header className="game-header">
        <button
          className={`menu-button ${panel === "settings" ? "active" : ""}`}
          onClick={() => openPanel("settings")}
          aria-label="Game menu"
          title="Game settings"
        >
          <img src={sprite("buttons/settings")} alt="" />
        </button>
        <div className="header-resources">
          <div
            className={`cash-resource-container ${balance && Number(balance.usdt.formatted) === 0 ? "needs-funds" : ""}`}
          >
            <button
              className="cash-resource"
              onClick={() => (account ? openPanel("hall") : setFunding(true))}
              title={
                balanceError ??
                (balance
                  ? `${balance.usdt.formatted} USDT · ${balance.bnb.formatted} BNB for gas`
                  : "Connect wallet · BNB Smart Chain mainnet")
              }
            >
              <img
                src={sprite("buttons/portfolio")}
                alt=""
                aria-hidden="true"
              />
              <b>
                {account
                  ? balanceError
                    ? "Unavailable"
                    : balance
                      ? `${Number(balance.usdt.formatted).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`
                      : "Reading…"
                  : "Wallet"}
              </b>
            </button>
            <button
              type="button"
              className="add-funds-btn"
              onClick={() => setFunding(true)}
              title="Fund your BSC wallet with USDT and BNB"
              aria-label="Fund wallet"
            >
              <Plus size={14} />
            </button>
          </div>
          <button
            className="portfolio-resource"
            onClick={() => openPanel("hall")}
            title="City Hall · actual wallet holdings"
          >
            <img src={sprite("buttons/buy")} alt="" aria-hidden="true" />
            <span>
              <small>STOCK VALUE</small>
              <b>
                {!balance || totalStockValue === null
                  ? "—"
                  : money(totalStockValue)}
              </b>
            </span>
          </button>
          <button
            className="market-button"
            onClick={() => openPanel("market")}
            title="Stock market"
          >
            <GameArt index={5} />
            <span>Market</span>
          </button>
          <OnchainWallet address={account} onChange={setAccount} />
        </div>
      </header>
      {tool !== "inspect" && !category && (
        <div className="active-tool-chip" role="status">
          <GameArt
            index={
              tool === "road"
                ? 1
                : tool === "bulldoze"
                  ? 4
                  : placeKind && defFor(placeKind).category === "services"
                    ? 3
                    : 2
            }
          />
          <span>
            <strong>
              {tool === "road"
                ? "Drawing roads"
                : tool === "bulldoze"
                  ? "Bulldoze mode"
                  : `${tool === "move" ? "Move" : "Place"} ${placeKind ? defFor(placeKind).name : "building"}`}
            </strong>
            <small>
              {tool === "road"
                ? "Free · drag a route"
                : tool === "bulldoze"
                  ? "Remove a visual object · wallet tokens stay held"
                  : "Free placement · click an island plot"}
            </small>
          </span>
          <button onClick={cancelPlacement} aria-label="Finish building">
            Done <kbd>Esc</kbd>
          </button>
        </div>
      )}
      {(!city.buildings.length || !city.roads.length) &&
        !panel &&
        !selected &&
        booted &&
        !category &&
        !trade && (
          <div
            className={`start-note ${guideHidden ? "minimized" : ""}`}
            role="status"
          >
            <span className="step-number">
              {steps.filter(Boolean).length}/3
            </span>
            {!guideHidden && (
              <span>
                <b>Empty island — build it yourself</b>
                <small>
                  {steps[0] ? "✓" : "1."} Draw roads (R) ·{" "}
                  {steps[1] ? "✓" : "2."} Build Exchange (S) ·{" "}
                  {steps[2] ? "✓" : "3."} Buy a company
                </small>
              </span>
            )}
            <button
              className="start-note-toggle"
              onClick={() => setGuideHidden((v) => !v)}
              aria-label={guideHidden ? "Expand guideline" : "Hide guideline"}
            >
              {guideHidden ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
          </div>
        )}
      <MainnetCatalogue
        open={Boolean(category)}
        category={category}
        onSelectCategory={chooseCategory}
        onClose={() => setCategory(null)}
        assets={assets}
        balance={balance}
        loading={assetsLoading}
        error={assetError}
        builtKinds={builtKinds}
        onTrade={openTrade}
        onPlaceAsset={startPlace}
        onPlaceService={placeService}
        onStartDrawRoad={chooseRoad}
      />
      {selection &&
        !panel &&
        !trade &&
        !intelBuilding &&
        !category &&
        !scanMode &&
        tool === "inspect" && (
          <aside
            className="inspection-panel"
            aria-label="Selected building"
            style={inspectorStyle}
          >
            <header
              title="Hold and drag to move this card"
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                const box =
                  event.currentTarget.parentElement!.getBoundingClientRect();
                inspectorDrag.current = {
                  dx: event.clientX - box.left,
                  dy: event.clientY - box.top,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!inspectorDrag.current) return;
                setInspectorStyle({
                  left: Math.max(
                    8,
                    Math.min(
                      window.innerWidth - 310,
                      event.clientX - inspectorDrag.current.dx,
                    ),
                  ),
                  top: Math.max(
                    8,
                    Math.min(
                      window.innerHeight - 150,
                      event.clientY - inspectorDrag.current.dy,
                    ),
                  ),
                  right: "auto",
                  bottom: "auto",
                });
              }}
              onPointerUp={() => {
                inspectorDrag.current = null;
              }}
              onPointerCancel={() => {
                inspectorDrag.current = null;
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <GripVertical size={15} className="drag-handle" />
                <div>
                  <small>CITY SERVICE</small>
                  <h2>{defFor(selection.kind).name}</h2>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close building inspector"
              >
                <X size={19} />
              </button>
            </header>
            <div
              className={`inspection-art ${defFor(selection.kind).category}`}
            >
              <img
                src={sprite(
                  buildingImage(selection, prices, DEFAULT_THRESHOLDS),
                )}
                alt={defFor(selection.kind).name}
              />
              <span>SERVICE</span>
            </div>
            <div
              className={`road-connection ${hasRoad(selection, city.roads) ? "connected" : ""}`}
            >
              <Route size={13} />
              {hasRoad(selection, city.roads)
                ? "Road access connected"
                : "No road access — connect a road"}
            </div>
            <p className="service-description">
              {defFor(selection.kind).description}
            </p>
            {selection.kind !== "monument" && (
              <button
                className="panel-action"
                onClick={() =>
                  openPanel(
                    selection.kind === "hall"
                      ? "hall"
                      : selection.kind === "exchange"
                        ? "market"
                        : selection.kind === "agent_hall"
                          ? "advisor"
                          : "research",
                  )
                }
              >
                Open{" "}
                {selection.kind === "hall"
                  ? "finances"
                  : selection.kind === "exchange"
                    ? "market"
                    : selection.kind === "agent_hall"
                      ? "Agent Hall"
                      : "data status"}
                <ChevronRight size={14} />
              </button>
            )}
            <div className="inspection-actions">
              <button
                onClick={() => {
                  setMoving(selection.id);
                  setPlaceKind(selection.kind);
                  setTool("move");
                }}
              >
                Move
              </button>
              <button className="danger" onClick={() => remove(selection)}>
                <Trash2 size={14} />
                Bulldoze
              </button>
            </div>
            <div className="inspection-note">
              Free visual service. Removing it does not spend or return wallet
              funds.
            </div>
          </aside>
        )}
      {scanMode && (
        <div className="scan-toolbar">
          <span>SCAN MODE · Hover or tap a building</span>
          <button
            onClick={() => {
              setScanMode(false);
              setScanTarget(null);
            }}
          >
            Exit scan <X size={14} />
          </button>
        </div>
      )}
      {scanMode && scanAsset && (
        <aside className="scan-card">
          <small>RWA SIGNAL</small>
          <h3>{scanAsset.symbol}</h3>
          <p>{scanAsset.platform}</p>
          <dl>
            <dt>Token price</dt>
            <dd>
              {scanAsset.priceUsd
                ? money(Number(scanAsset.priceUsd))
                : "Unavailable"}
            </dd>
            <dt>Observed</dt>
            <dd>
              {scanAsset.priceUpdatedAt
                ? new Date(scanAsset.priceUpdatedAt).toLocaleString()
                : "Timestamp unavailable"}
            </dd>
          </dl>
          <button
            onClick={() => {
              setActiveAsset(scanAsset);
              setScanMode(false);
              openPanel("research");
            }}
          >
            View Passport <ChevronRight size={14} />
          </button>
        </aside>
      )}
      {(panel === "hall" || panel === "market" || panel === "research") && (
        <CivicPanel
          mode={
            panel === "hall"
              ? "portfolio"
              : panel === "research"
                ? "data"
                : "market"
          }
          city={city}
          assets={assets}
          balance={balance}
          walletAddress={account}
          receipts={receipts}
          loading={assetsLoading}
          error={assetError}
          balanceLoading={balanceLoading}
          balanceError={balanceError}
          initialAsset={activeAsset}
          onClose={() => setPanel(null)}
          onRetry={() => setRefresh((n) => n + 1)}
          onTrade={openTrade}
          onPlaceAsset={startPlace}
          onFocus={focusBuilding}
          onScan={() => {
            openPanel(null);
            setScanMode(true);
            setScanTarget(null);
          }}
          onConnectWallet={connect}
          onFundWallet={() => {
            setPanel(null);
            setFunding(true);
          }}
        />
      )}
      {panel === "advisor" && (
        <MainnetAgentHall
          balance={balance}
          account={account}
          onClose={() => setPanel(null)}
          onTrade={openTrade}
          onConnectWallet={connect}
        />
      )}
      {(panel === "settings" || panel === "help") && (
        <aside
          className="utility-panel"
          ref={utilityPanel}
          tabIndex={-1}
          role="dialog"
          aria-label={panel === "settings" ? "Game settings" : "Controls"}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setPanel(null);
            }
          }}
        >
          <header>
            <h2>{panel === "settings" ? "Game settings" : "Controls"}</h2>
            <button onClick={() => setPanel(null)} aria-label="Close panel">
              <X size={18} />
            </button>
          </header>
          <div className="panel-body">
            {panel === "settings" ? (
              <>
                <div className="settings-mode-container">
                  <span className="settings-mode-label">
                    Market Operating Mode
                  </span>
                  <div className="mode-toggle-group">
                    <button
                      className="mode-toggle-btn active-live"
                      type="button"
                    >
                      <span className="live-pulse-dot" />
                      <span>BNB Smart Chain · Live RWA</span>
                    </button>
                  </div>
                  <small className="settings-mode-hint">
                    Actual wallet balances and issuer-token observations. Trades
                    require wallet approval.
                  </small>
                </div>
                <label className="setting-toggle">
                  <span>Island animation & traffic</span>
                  <input
                    type="checkbox"
                    checked={motion}
                    onChange={(e) => setMotion(e.target.checked)}
                  />
                </label>
                <label className="setting-toggle">
                  <span>Show construction grid</span>
                  <input
                    type="checkbox"
                    checked={grid}
                    onChange={(e) => setGrid(e.target.checked)}
                  />
                </label>
                <button
                  className="menu-row"
                  onClick={() => {
                    setZoom(1);
                    setCameraReset((n) => n + 1);
                  }}
                >
                  Reset camera
                  <Maximize2 size={15} />
                </button>
                <button className="menu-row" onClick={() => setPanel("help")}>
                  Controls & shortcuts
                  <HelpCircle size={15} />
                </button>
                <button
                  className="menu-row"
                  onClick={() => setRefresh((n) => n + 1)}
                  disabled={balanceLoading}
                >
                  Refresh wallet
                  <RefreshCw size={15} />
                </button>
                <button
                  className="menu-row danger"
                  onClick={() => setConfirmReset(true)}
                  disabled={pending}
                >
                  Start a new city
                  <Trash2 size={15} />
                </button>
                <p className="panel-disclaimer">
                  Your layout saves automatically for each connected wallet.
                  Resetting your city only clears buildings and roads; your
                  wallet tokens and trade receipts remain.
                </p>
                {balanceError && (
                  <p className="panel-disclaimer" role="alert">
                    {balanceError}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="help-intro">
                  Build your city from the ground up. Holdings stay in your BSC
                  wallet.
                </p>
                {[
                  ["Draw roads", "R, then click and drag"],
                  ["Company buildings", "B, choose an issuer token"],
                  ["City services", "S, choose, then click a plot"],
                  ["Select / portfolio", "V"],
                  ["Bulldoze layout", "X, then click a tile"],
                  ["Pan the map", "Drag, or hold Space + drag"],
                  ["Zoom", "Mouse wheel or + / −"],
                  ["Construction grid", "G"],
                  ["Undo / redo layout", "Ctrl Z / Ctrl Shift Z"],
                  ["Cancel construction", "Esc or right-click"],
                ].map(([label, key]) => (
                  <div className="shortcut-row" key={label}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
                <p className="panel-disclaimer">
                  Buy a supported issuer token with USDT in the Exchange. Once
                  the real balance confirms, place its building. Sell through a
                  reviewed quote to receive USDT. Removing a visual building
                  does not sell tokens. Roads and services are free.
                </p>
              </>
            )}
          </div>
        </aside>
      )}
      <footer className="command-bar">
        <nav className="tool-palette" aria-label="Construction tools">
          <button
            className={`portfolio-select-button ${portfolioView ? "active portfolio-active" : tool === "inspect" && !category ? "active select-active" : ""}`}
            onClick={toggleSelectPortfolio}
            aria-label={
              portfolioView
                ? "Switch to Select mode"
                : "Switch to Portfolio view"
            }
            aria-pressed={portfolioView}
            title={
              portfolioView
                ? "Click or press V for Select mode"
                : "Click or press V for Portfolio view"
            }
          >
            {portfolioView ? (
              <img
                src="/assets/portfolio-menu.png"
                alt="Portfolio view"
                className="menu-custom-icon"
              />
            ) : (
              <GameArt index={0} />
            )}
            <span>{portfolioView ? "Portfolio" : "Select"}</span>
            <kbd>V</kbd>
          </button>
          <span className="tool-divider" />
          <button
            className={`build-main-button ${category || tool === "road" || (tool === "build" && placeKind) ? "active" : ""}`}
            onClick={() =>
              category
                ? setCategory(null)
                : chooseCategory(
                    placeKind ? defFor(placeKind).category : lastCategory,
                  )
            }
            aria-label="Builds menu"
            aria-expanded={Boolean(category)}
          >
            <img
              src="/assets/buids-menu.png"
              alt="Build menu"
              className="menu-custom-icon"
            />
            <span>Build</span>
            <kbd>B</kbd>
          </button>
          <span className="tool-divider" />
          <button
            className={`bulldozer ${tool === "bulldoze" ? "active" : ""}`}
            onClick={() => {
              cancelPlacement();
              setTool("bulldoze");
              setCategory(null);
              setPanel(null);
              setSelected(null);
              setNotice(
                "Click a visual building or road to remove it. Ctrl Z undoes layout changes.",
              );
            }}
            aria-label="Bulldoze tool"
            aria-pressed={tool === "bulldoze"}
          >
            <GameArt index={4} />
            <span>Bulldoze</span>
            <kbd>X</kbd>
          </button>
        </nav>
      </footer>
      <div className="camera-controls" aria-label="Camera controls">
        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          aria-label="Zoom in"
        >
          <Plus size={16} />
        </button>
        <output>{Math.round(zoom * 100)}%</output>
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          aria-label="Zoom out"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setCameraReset((n) => n + 1);
          }}
          aria-label="Reset camera"
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <p
        className={`mainnet-layout-notice ${noticeVisible || pending ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice}
        {pending && (
          <button onClick={() => openPanel("hall")}>Check pending order</button>
        )}
      </p>
      {hasHall &&
        !panel &&
        !scanMode &&
        !intelBuilding &&
        !trade &&
        !category && (
          <CityAdvisor
            city={city}
            prices={prices}
            walletAddress={account}
            balance={balance}
            receipts={receipts}
          />
        )}
      {confirmReset && (
        <MainnetDialog
          title="Start a new city?"
          onClose={() => setConfirmReset(false)}
        >
          <p>
            This clears only your saved buildings and roads for this wallet.
            Tokens, USDT, and trade receipts stay intact.
          </p>
          <div className={styles.buttonRow}>
            <button
              className={styles.secondary}
              onClick={() => setConfirmReset(false)}
            >
              Keep this city
            </button>
            <button
              className={styles.primary}
              disabled={pending}
              onClick={() => {
                commitLayout(emptyLayout());
                cancelPlacement();
                setSelected(null);
                setPanel(null);
                setConfirmReset(false);
                setZoom(1);
                setCameraReset((n) => n + 1);
                setNotice(
                  "Empty city started. Your wallet holdings are unchanged.",
                );
              }}
            >
              Start empty city
            </button>
          </div>
        </MainnetDialog>
      )}
      {trade && account && (
        <MainnetTrade
          key={`${account}:${trade.asset.address}:${trade.side}`}
          asset={trade.asset}
          side={trade.side}
          account={account}
          initialAmount={trade.amount}
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
function GameArt({ index }: { index: number }) {
  return (
    <span
      aria-hidden="true"
      className={`game-art art-${index}`}
      style={{
        backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 100}%`,
      }}
    />
  );
}
