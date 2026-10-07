"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Crosshair,
  Layers,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { catalogue, SECTOR_DEFINITIONS, money } from "../lib/city";
import {
  companyMetadata,
  observedPrice,
  walletHolding,
} from "../lib/mainnet-research";
import type { MainnetAsset } from "../lib/mainnet";
import type { RwaSectorTab } from "../lib/rwa";
import type { CivicProps } from "./civic-panel";
import CivicResearch from "./civic-research";
import RwaSessionClock from "./rwa-session-clock";
import StockLogo from "./stock-logo";
import styles from "./civic-panel.module.css";

export default function CivicMarket(
  props: CivicProps & { onResetScroll: () => void },
) {
  const [view, setView] = useState<"research" | "bundle">("research");
  const defaultAsset =
    props.assets.find(
      (asset) => asset.ticker === "NVDA" && asset.platform === "bstock",
    ) ??
    props.assets.find((asset) => asset.ticker === "NVDA") ??
    props.assets[0];
  const [address, setAddress] = useState(
    props.initialAsset?.address ?? defaultAsset?.address ?? "",
  );
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("");
  const [issuer, setIssuer] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(48);
  const research = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inspection = props.mode === "data";
  const selectedAsset =
    props.assets.find(
      (asset) => asset.address.toLowerCase() === address.toLowerCase(),
    ) ??
    defaultAsset ??
    null;
  const storageKey = `stockva.mainnet.56.basket.${(props.walletAddress ?? props.balance?.account ?? "visitor").toLowerCase()}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const change = () => setCompact(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    props.onResetScroll();
  }, [view, props.onResetScroll]);
  useEffect(() => {
    if (props.initialAsset) {
      setAddress(props.initialAsset.address);
      setView("research");
    }
  }, [props.initialAsset]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      setSelected(
        Array.isArray(stored?.selected)
          ? stored.selected
              .filter(
                (item: unknown): item is string =>
                  typeof item === "string" && /^0x[0-9a-fA-F]{40}$/.test(item),
              )
              .slice(0, 100)
          : [],
      );
      setAmounts(
        stored?.amounts && typeof stored.amounts === "object"
          ? Object.fromEntries(
              Object.entries(stored.amounts).filter(
                (entry): entry is [string, string] =>
                  /^0x[0-9a-fA-F]{40}$/.test(entry[0]) &&
                  typeof entry[1] === "string" &&
                  entry[1].length < 80,
              ),
            )
          : {},
      );
    } catch {
      setSelected([]);
      setAmounts({});
    }
    setLoadedKey(storageKey);
  }, [storageKey]);
  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ selected, amounts }));
    } catch {
      /* Basket preferences never become wallet balances or execution. */
    }
  }, [selected, amounts, storageKey, loadedKey]);
  function addToBundle(asset: MainnetAsset) {
    setSelected((previous) => [
      ...new Set([...previous, asset.address.toLowerCase()]),
    ]);
    setAmounts((previous) => ({
      ...previous,
      [asset.address.toLowerCase()]:
        previous[asset.address.toLowerCase()] ?? "1",
    }));
    setView("bundle");
  }
  const shown = props.assets.filter((asset) => {
    const metadata = companyMetadata(asset);
    return (
      (!sector || metadata.sector === sector) &&
      (!issuer || asset.platform === issuer) &&
      `${asset.ticker} ${asset.symbol} ${asset.name} ${asset.platform} ${metadata.sector}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    );
  });

  return (
    <>
      {!inspection && (
        <nav className={styles.navigation} aria-label="Stock Exchange views">
          <button
            aria-pressed={view === "research"}
            onClick={() => setView("research")}
          >
            <Search size={16} /> Asset research
          </button>
          <button
            aria-pressed={view === "bundle"}
            onClick={() => setView("bundle")}
          >
            <Layers size={16} /> Baskets & Bundles{" "}
            {selected.length ? `(${selected.length})` : ""}
          </button>
        </nav>
      )}
      {inspection && (
        <div className={styles.intro}>
          <div>
            <h3>Know what backs the ticker.</h3>
            <p>
              Check the selected issuer, exact BSC contract, reserve evidence
              and price provenance. Missing evidence stays visible.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <RwaSessionClock />
            <button className={styles.secondary} onClick={props.onScan}>
              <Crosshair size={16} /> Inspect on island
            </button>
          </div>
        </div>
      )}
      {!inspection && view === "bundle" ? (
        <BundleBuilder
          {...props}
          selected={selected}
          amounts={amounts}
          setSelected={setSelected}
          setAmounts={setAmounts}
        />
      ) : (
        <div className={styles.marketLayout}>
          <aside className={styles.catalogue} aria-label="Asset catalogue">
            <div className={styles.catalogueHead}>
              <h4>{inspection ? "Asset inspection" : "Research catalogue"}</h4>
              <span>{shown.length} tokens</span>
            </div>
            <details
              className={styles.cataloguePicker}
              open={!compact || pickerOpen}
              onToggle={(event) => {
                if (compact) setPickerOpen(event.currentTarget.open);
              }}
            >
              <summary>
                <span>
                  {selectedAsset?.symbol ?? "Select a token"} · Change asset
                </span>
                <ChevronDown size={16} />
              </summary>
              <div>
                <label className={styles.search}>
                  <span className={styles.srOnly}>
                    Search company, ticker or issuer
                  </span>
                  <Search size={16} />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setVisible(48);
                    }}
                    placeholder="AAPL, NVIDIA, bStocks…"
                  />
                </label>
                <label className={styles.field}>
                  Sector
                  <select
                    value={sector}
                    onChange={(event) => {
                      setSector(event.target.value);
                      setVisible(48);
                    }}
                  >
                    <option value="">All sectors</option>
                    {[
                      ...new Set(
                        props.assets.map(
                          (asset) => companyMetadata(asset).sector,
                        ),
                      ),
                    ]
                      .sort()
                      .map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Issuer
                  <select
                    value={issuer}
                    onChange={(event) => {
                      setIssuer(event.target.value);
                      setVisible(48);
                    }}
                  >
                    <option value="">All issuers</option>
                    {[...new Set(props.assets.map((asset) => asset.platform))]
                      .sort()
                      .map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                  </select>
                </label>
                <div className={styles.catalogueList}>
                  {shown.slice(0, visible).map((asset) => {
                    const price = observedPrice(asset);
                    return (
                      <button
                        key={asset.address}
                        className={styles.assetOption}
                        aria-pressed={selectedAsset?.address === asset.address}
                        onClick={() => {
                          setAddress(asset.address);
                          if (compact) {
                            setPickerOpen(false);
                            requestAnimationFrame(() =>
                              research.current?.scrollIntoView({
                                block: "start",
                                behavior: "instant",
                              }),
                            );
                          }
                        }}
                      >
                        <StockLogo
                          ticker={asset.ticker}
                          name={asset.name}
                          size={30}
                        />
                        <span>
                          <strong>{asset.symbol}</strong>
                          <small>
                            {companyMetadata(asset).name} · {asset.platform}
                          </small>
                        </span>
                        <div>
                          {price === null ? "—" : money(price)}
                          <small>
                            {price === null
                              ? "Unavailable"
                              : !asset.priceUpdatedAt
                                ? "Time unavailable"
                                : Date.now() -
                                      Date.parse(asset.priceUpdatedAt) >
                                    120000
                                  ? "Stale"
                                  : "Observed"}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                  {!shown.length && (
                    <div className={styles.empty}>
                      <h4>
                        {props.loading
                          ? "Loading issuer tokens…"
                          : "No matching tokens."}
                      </h4>
                      <p>Try a ticker, company, sector or issuer.</p>
                      <button
                        className={styles.textButton}
                        onClick={() => {
                          setSearch("");
                          setSector("");
                          setIssuer("");
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  {shown.length > visible && (
                    <button
                      className={styles.textButton}
                      onClick={() => setVisible((count) => count + 48)}
                    >
                      Show more ({Math.min(visible, shown.length)} of{" "}
                      {shown.length})
                    </button>
                  )}
                </div>
                <p className={styles.caption}>
                  {inspection
                    ? "Issuer evidence is checked for this exact contract."
                    : "Choose an issuer token to research, trade or add to a basket."}
                </p>
                <button
                  className={styles.textButton}
                  disabled={props.loading}
                  onClick={() => {
                    props.onRetry();
                    setRevision((value) => value + 1);
                  }}
                >
                  <RefreshCw size={14} />
                  {props.loading ? "Refreshing…" : "Refresh data"}
                </button>
              </div>
            </details>
          </aside>
          <div ref={research} className={styles.research}>
            {selectedAsset ? (
              <CivicResearch
                key={`${selectedAsset.address}:${inspection}`}
                {...props}
                asset={selectedAsset}
                revision={revision}
                onAddToBundle={() => addToBundle(selectedAsset)}
                bundleAvailable={
                  !selected.includes(selectedAsset.address.toLowerCase())
                }
              />
            ) : (
              <div className={styles.empty}>
                <h4>
                  {props.loading
                    ? "Loading mainnet issuer catalogue…"
                    : "Issuer catalogue unavailable"}
                </h4>
                <p>Refresh data to retrieve available BSC stock tokens.</p>
                <button className={styles.secondary} onClick={props.onRetry}>
                  Retry catalogue
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {props.error && (
        <p className={styles.warning} role="status">
          {props.error}
        </p>
      )}
    </>
  );
}

type BundleProps = CivicProps & {
  selected: string[];
  amounts: Record<string, string>;
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  setAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};
function BundleBuilder(props: BundleProps) {
  const { assets, balance, selected, amounts, setSelected, setAmounts } = props;
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const [splitBudget, setSplitBudget] = useState("1");
  const [message, setMessage] = useState("");
  const [tabs, setTabs] = useState<RwaSectorTab[]>([]);
  const [visible, setVisible] = useState(48);
  const review = useRef<HTMLElement>(null);
  const chooser = useRef<HTMLElement>(null);
  const account = props.walletAddress ?? balance?.account;
  const pending = props.receipts.some(
    (receipt) =>
      receipt.status === "PENDING" &&
      receipt.account.toLowerCase() === account?.toLowerCase(),
  );
  const chosen = selected
    .map((address) =>
      assets.find((asset) => asset.address.toLowerCase() === address),
    )
    .filter((asset): asset is MainnetAsset => Boolean(asset));
  const total = chosen.reduce((sum, asset) => {
    const value = Number(amounts[asset.address.toLowerCase()]);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  const budget = balance ? Number(balance.usdt.formatted) : null;
  const shown = assets.filter(
    (asset) =>
      (sector === "all" || companyMetadata(asset).sector === sector) &&
      `${asset.ticker} ${asset.symbol} ${asset.name} ${asset.platform}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/rwa/sectors", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.available && Array.isArray(data.tabs)) setTabs(data.tabs);
      })
      .catch(() => {
        /* Unavailable taxonomy stays absent. */
      });
    return () => controller.abort();
  }, []);
  function toggle(asset: MainnetAsset) {
    const address = asset.address.toLowerCase();
    setSelected((previous) =>
      previous.includes(address)
        ? previous.filter((item) => item !== address)
        : [...previous, address],
    );
    setAmounts((previous) => ({
      ...previous,
      [address]: previous[address] ?? "1",
    }));
    setMessage("");
  }
  function preset(tickers: string[]) {
    // A preset chooses listed issuer tokens, whose full identities remain visible in review.
    const chosen = tickers
      .map(
        (ticker) =>
          assets.find(
            (asset) => asset.ticker === ticker && asset.platform === "bstock",
          ) ?? assets.find((asset) => asset.ticker === ticker),
      )
      .filter((asset): asset is MainnetAsset => Boolean(asset));
    setSelected(chosen.map((asset) => asset.address.toLowerCase()));
    setAmounts((previous) => ({
      ...previous,
      ...Object.fromEntries(
        chosen.map((asset) => [
          asset.address.toLowerCase(),
          previous[asset.address.toLowerCase()] ?? "1",
        ]),
      ),
    }));
    setMessage(
      chosen.length
        ? "Review each selected issuer token before signing."
        : "No supported issuer tokens are available for this basket.",
    );
  }
  const sectorDefinition = SECTOR_DEFINITIONS.find((item) =>
    item.stocks.some((ticker) =>
      assets.some(
        (asset) =>
          asset.ticker === ticker && companyMetadata(asset).sector === sector,
      ),
    ),
  );
  return (
    <>
      <div className={styles.intro}>
        <div>
          <h3>City Baskets & Sector Bundles</h3>
          <p>
            Assemble a basket by sector or choose individual issuer tokens. Each
            purchase gets its own live quote and wallet confirmation.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <RwaSessionClock />
          <span className={styles.statusBadge}>
            {budget === null
              ? "Wallet balance unavailable"
              : `${budget.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT available`}
          </span>
        </div>
      </div>
      <section
        className={styles.sectorBasketsSection}
        aria-label="Sector baskets"
      >
        <div className={styles.sectionHeading}>
          <h4>1-Click Sector Baskets</h4>
          <span>Supported issuer tokens</span>
        </div>
        <div className={styles.sectorPresetsRow}>
          {SECTOR_DEFINITIONS.map((definition) => {
            const available = definition.stocks.filter((ticker) =>
              assets.some((asset) => asset.ticker === ticker),
            );
            const selectedCount = definition.stocks.filter((ticker) =>
              chosen.some((asset) => asset.ticker === ticker),
            ).length;
            return (
              <button
                key={definition.key}
                type="button"
                className={styles.sectorPresetBtn}
                disabled={!available.length}
                aria-pressed={Boolean(
                  available.length && selectedCount === available.length,
                )}
                onClick={() => preset(available)}
                title={`Select ${definition.name} basket`}
              >
                <div className={styles.sectorPresetHeader}>
                  <span
                    className={styles.sectorPill}
                    style={{
                      backgroundColor: `${definition.color}22`,
                      color: definition.color,
                      border: `1px solid ${definition.color}55`,
                    }}
                  >
                    {definition.badge}
                  </span>
                  {selectedCount > 0 && <Check size={14} />}
                </div>
                <span className={styles.sectorPresetName}>
                  {definition.name.replace(
                    / Tower| Complex| Plaza| Grid & Terminal| Works| Network Hub| Pavilion| Conglomerate| Foundry| Exchange/,
                    "",
                  )}
                </span>
                <span className={styles.sectorPresetCount}>
                  {selectedCount
                    ? `${selectedCount} selected`
                    : `${available.length} companies available`}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <div className={styles.bundleLayout}>
        <section ref={chooser}>
          <div className={styles.sectionHeading}>
            <h4>Choose your companies</h4>
            <span>{assets.length} issuer tokens</span>
          </div>
          <p className={styles.caption}>
            Every issuer token has its own contract, price and trading route.
          </p>
          <div className={styles.bundlePresets}>
            <button
              className={styles.chip}
              type="button"
              onClick={() => preset(["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN"])}
            >
              Mega-cap tech
            </button>
            <button
              className={styles.chip}
              type="button"
              onClick={() => preset(["SPY", "QQQ", "IWM", "VTI", "VOO"])}
            >
              Broad index ETFs
            </button>
            <button
              className={styles.chip}
              type="button"
              onClick={() =>
                preset(
                  SECTOR_DEFINITIONS.map(
                    (definition) =>
                      definition.stocks.find((ticker) =>
                        assets.some((asset) => asset.ticker === ticker),
                      ) ?? "",
                  ).filter(Boolean),
                )
              }
            >
              10-Sector mix
            </button>
            <button
              className={styles.textButton}
              type="button"
              onClick={() => {
                setSelected([]);
                setMessage("");
              }}
            >
              Clear selection
            </button>
          </div>
          {tabs.length > 0 && (
            <div
              className={styles.bundlePresets}
              aria-label="Official RWA baskets"
            >
              <span className={styles.caption}>Binance tabs:</span>
              {tabs.map((tab) => {
                const count = tab.tickers.filter((ticker) =>
                  assets.some((asset) => asset.ticker === ticker),
                ).length;
                return count ? (
                  <button
                    key={tab.id}
                    className={styles.chip}
                    type="button"
                    onClick={() => preset(tab.tickers)}
                  >
                    {tab.label} ({count})
                  </button>
                ) : null;
              })}
            </div>
          )}
          <div
            className={styles.sectorFilterTabs}
            aria-label="Filter stocks by sector"
          >
            <button
              type="button"
              className={`${styles.sectorFilterTab} ${sector === "all" ? styles.sectorFilterTabActive : ""}`}
              onClick={() => {
                setSector("all");
                setVisible(48);
              }}
            >
              All tokens ({assets.length})
            </button>
            {[...new Set(assets.map((asset) => companyMetadata(asset).sector))]
              .sort()
              .map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`${styles.sectorFilterTab} ${sector === name ? styles.sectorFilterTabActive : ""}`}
                  onClick={() => {
                    setSector(name);
                    setVisible(48);
                  }}
                >
                  {name}
                </button>
              ))}
          </div>
          {sector !== "all" && (
            <div className={styles.sectorBanner}>
              <div className={styles.sectorBannerInfo}>
                <div className={styles.sectorBannerTitle}>
                  <span className={styles.sectorPill}>
                    {sectorDefinition?.badge ?? sector}
                  </span>
                  <span>{sector}</span>
                </div>
                <p className={styles.sectorBannerDesc}>
                  {sectorDefinition?.description ??
                    "Select the issuer tokens you want to review."}
                </p>
              </div>
              <button
                type="button"
                className={styles.sectorBannerBtn}
                onClick={() =>
                  preset([...new Set(shown.map((asset) => asset.ticker))])
                }
              >
                Add sector companies
              </button>
            </div>
          )}
          <label className={styles.search}>
            <span className={styles.srOnly}>Search basket tokens</span>
            <Search size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setVisible(48);
              }}
              placeholder="Search company, ticker or issuer…"
            />
          </label>
          <div className={styles.selectionBar}>
            <span>{chosen.length} tokens selected</span>
            <button
              className={styles.textButton}
              type="button"
              disabled={!chosen.length}
              onClick={() => review.current?.scrollIntoView({ block: "start" })}
            >
              Review allocations <ChevronDown size={14} />
            </button>
          </div>
          <div className={styles.bundleGrid}>
            {shown.slice(0, visible).map((asset) => {
              const price = observedPrice(asset),
                active = selected.includes(asset.address.toLowerCase());
              const definition = SECTOR_DEFINITIONS.find((item) =>
                item.stocks.includes(asset.ticker),
              );
              return (
                <button
                  key={asset.address}
                  type="button"
                  className={styles.bundleOption}
                  aria-pressed={active}
                  onClick={() => toggle(asset)}
                >
                  <div className={styles.bundleCardTop}>
                    <StockLogo
                      ticker={asset.ticker}
                      name={asset.name}
                      size={36}
                      shape="rounded"
                    />
                    <span
                      className={styles.sectorPill}
                      style={{ color: definition?.color }}
                    >
                      {definition?.badge ?? companyMetadata(asset).sector}
                    </span>
                  </div>
                  {active && (
                    <Check size={18} style={{ color: "var(--accent)" }} />
                  )}
                  <strong>{asset.symbol}</strong>
                  <small>
                    {companyMetadata(asset).name} · {asset.platform}
                  </small>
                  <div className={styles.bundleCardPrice}>
                    <span>Observed price</span>
                    <strong>{price === null ? "—" : money(price)}</strong>
                  </div>
                </button>
              );
            })}
          </div>
          {!shown.length && (
            <p className={styles.notice}>No tokens match your filters.</p>
          )}
          {shown.length > visible && (
            <button
              className={styles.textButton}
              onClick={() => setVisible((count) => count + 48)}
            >
              Show more ({Math.min(visible, shown.length)} of {shown.length})
            </button>
          )}
        </section>
        <aside ref={review} className={styles.bundleReview}>
          <div className={styles.sectionHeading}>
            <h4>Your basket</h4>
            <button
              className={styles.textButton}
              type="button"
              onClick={() =>
                chooser.current?.scrollIntoView({ block: "start" })
              }
            >
              Pick more
            </button>
          </div>
          <p className={styles.caption}>
            {chosen.length
              ? `${chosen.length} tokens selected. Set a USDT budget and review purchases individually.`
              : "Choose a sector basket or individual issuer tokens."}
          </p>
          {chosen.length > 0 && (
            <>
              <label className={styles.field}>
                Uniform allocation
                <select
                  value=""
                  onChange={(event) =>
                    setAmounts((previous) => ({
                      ...previous,
                      ...Object.fromEntries(
                        chosen.map((asset) => [
                          asset.address.toLowerCase(),
                          event.target.value,
                        ]),
                      ),
                    }))
                  }
                >
                  <option value="" disabled>
                    Set same amount for all
                  </option>
                  {[0.5, 1, 2, 5, 10].map((amount) => (
                    <option key={amount} value={amount}>
                      {money(amount)} per token
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.field}>
                <span>Distribute total budget evenly</span>
                <div className={styles.evenSplitBox}>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.evenSplitInput}
                    value={splitBudget}
                    onChange={(event) => setSplitBudget(event.target.value)}
                    aria-label="Total USDT budget to distribute"
                  />
                  <button
                    type="button"
                    className={styles.evenSplitBtn}
                    onClick={() => {
                      const total = Number(splitBudget);
                      if (
                        !Number.isFinite(total) ||
                        total <= 0 ||
                        !chosen.length
                      ) {
                        setMessage("Enter a positive USDT budget.");
                        return;
                      }
                      const amount = (
                        Math.floor((total * 1e6) / chosen.length) / 1e6
                      )
                        .toFixed(6)
                        .replace(/0+$/, "")
                        .replace(/\.$/, "");
                      if (Number(amount) <= 0) {
                        setMessage(
                          "Increase the budget for the selected number of tokens.",
                        );
                        return;
                      }
                      setAmounts((previous) => ({
                        ...previous,
                        ...Object.fromEntries(
                          chosen.map((asset) => [
                            asset.address.toLowerCase(),
                            amount,
                          ]),
                        ),
                      }));
                      setMessage(
                        "Budget distributed. Each purchase still requires a fresh route quote.",
                      );
                    }}
                  >
                    Distribute
                  </button>
                </div>
              </div>
              <div className={styles.bundleAmounts}>
                {chosen.map((asset) => {
                  const address = asset.address.toLowerCase(),
                    amount = amounts[address] ?? "",
                    valid =
                      /^(?:\d+\.?\d*|\.\d+)$/.test(amount) &&
                      Number(amount) > 0 &&
                      Number.isFinite(Number(amount));
                  const holding = walletHolding(balance, asset),
                    placed = props.city.buildings.some(
                      (building) =>
                        building.tokenAddress?.toLowerCase() === address,
                    );
                  return (
                    <div className={styles.field} key={address}>
                      <span className={styles.bundleAmountLabel}>
                        <label
                          htmlFor={`basket-${address}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <StockLogo
                            ticker={asset.ticker}
                            size={18}
                            shape="circle"
                          />
                          <strong>{asset.symbol}</strong>
                          <span className={styles.caption}>· USDT</span>
                        </label>
                        <button
                          type="button"
                          className={styles.iconButton}
                          aria-label={`Remove ${asset.symbol} from basket`}
                          onClick={() => toggle(asset)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                      <small>
                        {asset.platform} · {asset.address.slice(0, 8)}…
                        {asset.address.slice(-6)}
                      </small>
                      <input
                        id={`basket-${address}`}
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        aria-invalid={!valid}
                        onChange={(event) => {
                          setAmounts((previous) => ({
                            ...previous,
                            [address]: event.target.value,
                          }));
                          setMessage("");
                        }}
                      />
                      <small>
                        {!valid
                          ? "Enter a positive USDT amount"
                          : "Final token quantity comes from your reviewed live quote."}
                      </small>
                      <button
                        className={styles.primary}
                        type="button"
                        disabled={
                          !valid ||
                          pending ||
                          Boolean(
                            balance &&
                            Number(amount) > Number(balance.usdt.formatted),
                          )
                        }
                        onClick={() => props.onTrade(asset, "buy", amount)}
                      >
                        Review buy {asset.symbol} <ArrowUpRight size={14} />
                      </button>
                      {holding &&
                        BigInt(holding.raw) > 0n &&
                        catalogue.some(
                          (definition) => definition.ticker === asset.ticker,
                        ) && (
                          <button
                            className={styles.secondary}
                            type="button"
                            disabled={placed}
                            onClick={() => props.onPlaceAsset(asset)}
                          >
                            {placed ? "In city" : "Place held token"}
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div className={styles.bundleTotal}>
            <span>Planned basket budget</span>
            <strong>{money(total)}</strong>
          </div>
          <p className={styles.caption}>
            BNB transaction fees are additional. Your wallet balance changes
            only after a confirmed trade.
          </p>
          {budget !== null && total > budget && (
            <p className={styles.warning}>
              Your planned basket exceeds the wallet's USDT balance.
            </p>
          )}
          {pending && (
            <p className={styles.warning}>
              Resolve the pending order in City Hall before another purchase.
            </p>
          )}
          {!account && (
            <button className={styles.primary} onClick={props.onConnectWallet}>
              <Wallet size={16} /> Connect wallet
            </button>
          )}
          {account && (
            <button className={styles.secondary} onClick={props.onFundWallet}>
              <Wallet size={16} /> Fund wallet
            </button>
          )}
          {message && (
            <p className={styles.warning} role="status">
              {message}
            </p>
          )}
        </aside>
      </div>
      <ol className={styles.bundleSteps}>
        <li>Pick a basket or individual issuer tokens.</li>
        <li>Review each live quote and confirm the purchase in your wallet.</li>
        <li>
          Place buildings for tokens you hold. Selling returns USDT to your
          wallet.
        </li>
      </ol>
    </>
  );
}
