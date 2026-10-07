"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Layers,
  Search,
  X,
} from "lucide-react";
import {
  catalogue,
  defFor,
  defForSector,
  money,
  SECTOR_DEFINITIONS,
  sprite,
  type BuildingDef,
  type BuildingKind,
  type Category,
  type SectorBuildingKind,
} from "../lib/city";
import {
  bscAddressLink,
  type MainnetAsset,
  type WalletBalances,
} from "../lib/mainnet";
import StockLogo from "./stock-logo";
import { OrderPreflight } from "./order-preflight";
import styles from "./building-catalogue-modal.module.css";

export type MainnetCatalogueProps = {
  open: boolean;
  category: Category | null;
  onSelectCategory: (category: Category) => void;
  onClose: () => void;
  assets: MainnetAsset[];
  balance: WalletBalances | null;
  loading: boolean;
  error: string | null;
  builtKinds?: Set<BuildingKind>;
  initialKind?: BuildingKind | null;
  onTrade: (asset: MainnetAsset, side: "buy" | "sell", amount?: string) => void;
  onPlaceAsset: (asset: MainnetAsset) => void;
  onPlaceService: (kind: BuildingKind) => void;
  onStartDrawRoad: () => void;
};

const hasUnits = (raw: string | undefined) => {
  try {
    return raw !== undefined && BigInt(raw) > 0n;
  } catch {
    return false;
  }
};
const observedPrice = (asset: MainnetAsset | null | undefined) =>
  asset?.priceUsd !== null && Number(asset?.priceUsd) > 0
    ? money(Number(asset?.priceUsd))
    : "Unavailable";
const observationTime = (asset: MainnetAsset) => {
  if (
    !asset.priceUpdatedAt ||
    !Number.isFinite(Date.parse(asset.priceUpdatedAt))
  )
    return "Price timestamp unavailable";
  return `Observed ${new Date(asset.priceUpdatedAt).toLocaleString()}${Date.now() - Date.parse(asset.priceUpdatedAt) > 120_000 ? " · stale" : ""}`;
};

/** Original construction catalogue, backed only by BSC issuer tokens and wallet balances. */
export function MainnetCatalogue(props: MainnetCatalogueProps) {
  const {
    open,
    category,
    assets,
    balance,
    loading,
    error,
    builtKinds,
    onClose,
  } = props;
  const [selectedKind, setSelectedKind] = useState<BuildingKind | null>(null);
  const [selectedSector, setSelectedSector] =
    useState<SectorBuildingKind | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [issuerAddress, setIssuerAddress] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sectorSearch, setSectorSearch] = useState("");
  const [amount, setAmount] = useState("1");
  const dialog = useRef<HTMLDivElement>(null);
  const title = useId();
  const amountId = useId();
  const issuerId = useId();
  const back = () => {
    if (selectedTicker) {
      setSelectedTicker(null);
      setIssuerAddress(null);
    } else if (selectedSector) setSelectedSector(null);
    else if (selectedKind) {
      setSelectedKind(null);
      setIssuerAddress(null);
    } else onClose();
  };
  useEffect(() => {
    if (!open) return;
    setSelectedKind(props.initialKind ?? null);
    setSelectedSector(null);
    setSelectedTicker(null);
    setIssuerAddress(null);
    setSearch("");
    setSectorSearch("");
    setAmount("1");
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open, props.initialKind]);
  if (!open || !category) return null;

  const activeSector = selectedSector ? defForSector(selectedSector) : null;
  const selectedDef = selectedTicker
    ? catalogue.find((def) => def.ticker === selectedTicker)
    : selectedKind
      ? defFor(selectedKind)
      : null;
  const issuerOptions = selectedDef?.ticker
    ? assets.filter((asset) => asset.ticker === selectedDef.ticker)
    : [];
  const selectedAsset =
    issuerOptions.find(
      (asset) => asset.address.toLowerCase() === issuerAddress?.toLowerCase(),
    ) ??
    issuerOptions.find((asset) =>
      balance?.holdings.some(
        (holding) =>
          holding.asset.address.toLowerCase() === asset.address.toLowerCase() &&
          hasUnits(holding.raw),
      ),
    ) ??
    issuerOptions[0] ??
    null;
  const holding = selectedAsset
    ? balance?.holdings.find(
        (row) =>
          row.asset.address.toLowerCase() ===
          selectedAsset.address.toLowerCase(),
      )
    : null;
  const held = hasUnits(holding?.raw);
  const alreadyBuilt = Boolean(
    selectedDef && builtKinds?.has(selectedDef.kind),
  );
  const numberAmount = Number(amount);
  const validAmount =
    amount.trim() !== "" && Number.isFinite(numberAmount) && numberAmount > 0;
  const companyDefs = catalogue.filter(
    (def) =>
      def.category === "companies" &&
      assets.some((asset) => asset.ticker === def.ticker),
  );
  const serviceDefs = catalogue.filter((def) => def.category === "services");
  const query = search.trim().toLowerCase();
  const displayedDefs = (
    category === "companies" ? companyDefs : serviceDefs
  ).filter((def) =>
    `${def.name} ${def.ticker ?? ""}`.toLowerCase().includes(query),
  );
  const sectorTickers = (key: SectorBuildingKind) => {
    const sector = defForSector(key);
    return (
      sector?.stocks.filter((ticker) =>
        assets.some((asset) => asset.ticker === ticker),
      ) ?? []
    );
  };
  const sectorDefs = activeSector
    ? sectorTickers(activeSector.key)
        .map((ticker) => catalogue.find((def) => def.ticker === ticker))
        .filter((def): def is BuildingDef => Boolean(def))
        .filter((def) =>
          `${def.name} ${def.ticker}`
            .toLowerCase()
            .includes(sectorSearch.trim().toLowerCase()),
        )
    : [];
  const priceFor = (ticker: string | undefined) => {
    const options = assets.filter((asset) => asset.ticker === ticker);
    const prices = options
      .map((asset) => Number(asset.priceUsd))
      .filter((price) => price > 0);
    if (!prices.length) return "Unavailable";
    const low = Math.min(...prices),
      high = Math.max(...prices);
    return low === high ? money(low) : `${money(low)}–${money(high)}`;
  };
  const resetSelection = () => {
    setSelectedKind(null);
    setSelectedSector(null);
    setSelectedTicker(null);
    setIssuerAddress(null);
  };
  const selectDef = (def: BuildingDef) => {
    setSelectedKind(def.kind);
    setIssuerAddress(null);
    setAmount("1");
  };
  const closeAnd = (action: () => void) => {
    onClose();
    action();
  };
  const funds = balance
    ? `${Number(balance.usdt.formatted).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT`
    : "Connect wallet";

  const stockInputs = () =>
    selectedAsset ? (
      <>
        <div className={styles.formGroup}>
          <div className={styles.formLabelRow}>
            <label htmlFor={issuerId}>Issuer token on BSC</label>
            <span className={styles.unitsBadge}>
              {issuerOptions.length}{" "}
              {issuerOptions.length === 1 ? "issuer" : "issuers"}
            </span>
          </div>
          <div className={styles.nominalInputWrap}>
            <select
              id={issuerId}
              className={styles.nominalInput}
              value={selectedAsset.address}
              onChange={(event) => setIssuerAddress(event.target.value)}
            >
              {issuerOptions.map((asset) => (
                <option key={asset.address} value={asset.address}>
                  {asset.symbol} · {asset.platform}
                </option>
              ))}
            </select>
          </div>
          <small className={styles.signatureNote}>
            <a
              href={bscAddressLink(selectedAsset.address)}
              target="_blank"
              rel="noreferrer"
              style={{ overflowWrap: "anywhere", color: "#f0b90b" }}
            >
              {selectedAsset.address}
            </a>
          </small>
        </div>
        <div className={styles.priceRow}>
          <span className={styles.priceLabel}>Observed token price</span>
          <span className={styles.priceValue}>
            {observedPrice(selectedAsset)}
          </span>
        </div>
        <small className={styles.signatureNote}>
          {observationTime(selectedAsset)}
        </small>
        <div className={styles.formGroup}>
          <div className={styles.formLabelRow}>
            <label htmlFor={amountId}>Investment amount</label>
            <span className={styles.unitsBadge}>USDT</span>
          </div>
          <div className={styles.presetChips}>
            {["0.50", "1", "3"].map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.presetBtn} ${Number(amount) === Number(preset) ? styles.presetBtnActive : ""}`}
                onClick={() => setAmount(preset)}
              >
                ${preset}
              </button>
            ))}
            <button
              type="button"
              className={styles.presetBtn}
              disabled={!balance || Number(balance.usdt.formatted) <= 0}
              onClick={() => {
                if (balance) setAmount(balance.usdt.formatted);
              }}
            >
              Max
            </button>
          </div>
          <div className={styles.nominalInputWrap}>
            <span className={styles.currencyPrefix}>$</span>
            <input
              id={amountId}
              className={styles.nominalInput}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Enter amount"
            />
            <span className={styles.currencySuffix}>USDT</span>
          </div>
        </div>
        <OrderPreflight
          amount={validAmount ? numberAmount : 0}
          walletAddress={balance?.account}
        />
        <button
          type="button"
          className={styles.commitBtn}
          disabled={!validAmount}
          onClick={() =>
            closeAnd(() => props.onTrade(selectedAsset, "buy", amount))
          }
        >
          <span>Review purchase of {selectedAsset.symbol}</span>
          <ArrowUpRight size={18} />
        </button>
        <small className={styles.signatureNote}>
          A fresh quote and transaction simulation are required before your
          wallet signs. Observed prices are not executable quotes.
        </small>
        <div className={styles.servicePriceBox}>
          <span className={styles.priceLabel}>Wallet holding</span>
          <div className={styles.serviceCostBig} style={{ fontSize: 20 }}>
            {balance
              ? `${holding?.formatted ?? "0"} ${selectedAsset.symbol}`
              : "Connect wallet"}
          </div>
        </div>
        <div className={styles.presetChips}>
          <button
            type="button"
            className={styles.presetBtn}
            disabled={!held}
            onClick={() => closeAnd(() => props.onTrade(selectedAsset, "sell"))}
          >
            Review sale
          </button>
          <button
            type="button"
            className={styles.presetBtn}
            disabled={!held || alreadyBuilt}
            onClick={() => closeAnd(() => props.onPlaceAsset(selectedAsset))}
          >
            {alreadyBuilt ? "Already in city" : "Place wallet holding"}
          </button>
        </div>
        <small className={styles.signatureNote}>
          Building placement is free. Your tokens stay in your wallet.
        </small>
      </>
    ) : (
      <p className={styles.signatureNote}>
        No verified BSC issuer token is available for this company.
      </p>
    );

  const sectorPicker = () =>
    activeSector ? (
      <div className={styles.sectorStockPickerBox}>
        <div className={styles.sectorStockPickerHeader}>
          <span className={styles.sectorStockPickerTitle}>
            Select Company in {activeSector.badge}
          </span>
          <label className={styles.searchBox}>
            <Search size={12} />
            <input
              className={styles.searchInput}
              aria-label="Filter sector stocks"
              placeholder="Filter stocks…"
              value={sectorSearch}
              onChange={(event) => setSectorSearch(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.sectorStockGrid}>
          {sectorDefs.map((def) => (
            <button
              key={def.kind}
              type="button"
              className={`${styles.sectorStockBtn} ${selectedTicker === def.ticker ? styles.sectorStockBtnActive : ""} ${builtKinds?.has(def.kind) ? styles.sectorStockBtnBuilt : ""}`}
              onClick={() => {
                setSelectedTicker(def.ticker!);
                setIssuerAddress(null);
                setAmount("1");
              }}
            >
              <StockLogo
                ticker={def.ticker!}
                name={def.name}
                size={20}
                shape="circle"
              />
              <div className={styles.sectorStockMeta}>
                <span className={styles.sectorStockTicker}>{def.ticker}</span>
                <span className={styles.sectorStockName}>{def.name}</span>
                {builtKinds?.has(def.kind) && (
                  <span className={styles.sectorStockBuiltPill}>✓ Built</span>
                )}
                <span className={styles.signatureNote}>
                  {priceFor(def.ticker)}
                </span>
              </div>
            </button>
          ))}
        </div>
        {!sectorDefs.length && !loading && (
          <p className={styles.signatureNote}>
            No matching verified BSC issuer tokens in this sector.
          </p>
        )}
      </div>
    ) : null;

  const details = (sector = false) =>
    selectedDef ? (
      <div className={styles.orderFormLayout}>
        <div className={styles.buildingShowcase}>
          <div className={styles.spritePodium}>
            <img
              src={sprite(
                sector && activeSector ? activeSector.image : selectedDef.image,
              )}
              alt={
                sector && activeSector ? activeSector.name : selectedDef.name
              }
              className={styles.largeBuildingSprite}
            />
          </div>
          <div className={styles.showcaseMeta}>
            <div className={styles.showcaseTitleRow}>
              {selectedDef.ticker ? (
                <StockLogo
                  ticker={selectedDef.ticker}
                  name={selectedDef.name}
                  size={32}
                />
              ) : (
                <div className={styles.serviceIconPill}>
                  <Layers size={18} />
                </div>
              )}
              <div>
                <h4>{selectedDef.name}</h4>
                <small className={styles.subMeta}>
                  {selectedDef.ticker
                    ? `${selectedDef.ticker} · 2×2 Footprint · Tokenized Stock`
                    : "City Service · 2×2 Footprint"}
                </small>
              </div>
            </div>
            {selectedDef.ticker && (
              <div className={styles.priceRow}>
                <span className={styles.priceLabel}>
                  {selectedAsset
                    ? `${selectedAsset.symbol} · ${selectedAsset.platform}`
                    : "Issuer token"}
                </span>
                <span className={styles.priceValue}>
                  {observedPrice(selectedAsset)}
                </span>
              </div>
            )}
            <p className={styles.buildingDesc}>
              {selectedDef.description.replace(
                /Place a building to create.*$/,
                "Buildings represent the stock tokens held in your wallet.",
              )}
            </p>
            {sector && activeSector && (
              <p className={styles.buildingDesc}>{activeSector.description}</p>
            )}
          </div>
        </div>
        <div className={styles.orderFormInputs}>
          {sector && sectorPicker()}
          {selectedDef.ticker ? (
            stockInputs()
          ) : (
            <>
              <div className={styles.servicePriceBox}>
                <span className={styles.priceLabel}>Construction cost</span>
                <div className={styles.serviceCostBig}>Free</div>
                <small className={styles.subMeta}>
                  Place a civic service on your island. Your wallet balance is
                  unchanged.
                </small>
              </div>
              <button
                type="button"
                className={styles.commitBtn}
                disabled={alreadyBuilt}
                onClick={() =>
                  closeAnd(() => props.onPlaceService(selectedDef.kind))
                }
              >
                <span>
                  {alreadyBuilt
                    ? "Already Built on Island (Max 1)"
                    : "Place on Island"}
                </span>
                {!alreadyBuilt && <ArrowUpRight size={18} />}
              </button>
              {alreadyBuilt && (
                <p className={styles.alreadyBuiltNotice}>
                  Each civic service can be placed once.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            back();
          }
          if (event.key !== "Tab") return;
          const nodes = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
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
          <div className={styles.headerLeft}>
            <span className={styles.titleBadge} id={title}>
              CONSTRUCTION CATALOGUE
            </span>
            <div
              className={styles.categoryTabs}
              role="tablist"
              aria-label="Construction categories"
            >
              {(["roads", "companies", "sectors", "services"] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={category === tab}
                    className={`${styles.catTab} ${category === tab ? styles.catTabActive : ""}`}
                    onClick={() => {
                      resetSelection();
                      props.onSelectCategory(tab);
                    }}
                  >
                    <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
                  </button>
                ),
              )}
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close catalogue"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </header>
        <div className={styles.body}>
          {(category === "companies" || category === "sectors") && loading && (
            <p className={styles.signatureNote} role="status">
              Loading BSC issuer tokens…
            </p>
          )}
          {(category === "companies" || category === "sectors") && error && (
            <p className={styles.alreadyBuiltNotice} role="alert">
              {error}
            </p>
          )}
          {category === "roads" ? (
            <div className={styles.roadsView}>
              <div className={styles.roadCardLarge}>
                <div className={styles.roadImgBox}>
                  <img
                    src={sprite("roads/straight_ul_lr")}
                    alt="Two-lane road"
                  />
                </div>
                <div className={styles.roadDetails}>
                  <h3>Two-Lane Asphalt Road</h3>
                  <span className={styles.roadCost}>Free</span>
                  <p>
                    Connects company buildings to civic services and the transit
                    network. Vehicles navigate connected routes automatically.
                  </p>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={() => closeAnd(props.onStartDrawRoad)}
                  >
                    <span>Start Drawing Roads</span>
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          ) : category === "sectors" ? (
            activeSector ? (
              <div className={styles.orderFormView}>
                <div className={styles.sectorFormHeader}>
                  <button
                    type="button"
                    className={styles.backBtn}
                    onClick={resetSelection}
                  >
                    <ArrowLeft size={15} />
                    <span>Back to all Sectors</span>
                  </button>
                  <div className={styles.treasuryChip}>
                    <span>Wallet Funds:</span>
                    <strong>{funds}</strong>
                  </div>
                </div>
                <div
                  className={styles.sectorSwitcherBar}
                  role="tablist"
                  aria-label="Switch sector"
                >
                  {SECTOR_DEFINITIONS.map((sector) => (
                    <button
                      key={sector.key}
                      type="button"
                      role="tab"
                      aria-selected={sector.key === selectedSector}
                      className={`${styles.sectorSwitcherPill} ${sector.key === selectedSector ? styles.sectorSwitcherPillActive : ""}`}
                      onClick={() => {
                        setSelectedSector(sector.key);
                        setSelectedTicker(null);
                        setIssuerAddress(null);
                        setSectorSearch("");
                      }}
                    >
                      {sector.badge} ·{" "}
                      {sector.name.replace(
                        / Tower| Complex| Hub| Pavilion| Works| Foundry| Plaza| Exchange| Conglomerate/g,
                        "",
                      )}
                    </button>
                  ))}
                </div>
                {selectedDef ? (
                  details(true)
                ) : (
                  <div className={styles.orderFormLayout}>
                    <div className={styles.buildingShowcase}>
                      <div className={styles.spritePodium}>
                        <img
                          src={sprite(activeSector.image)}
                          alt={activeSector.name}
                          className={styles.largeBuildingSprite}
                        />
                      </div>
                      <div className={styles.showcaseMeta}>
                        <h4>{activeSector.name}</h4>
                        <p className={styles.buildingDesc}>
                          {activeSector.description}
                        </p>
                        <small className={styles.signatureNote}>
                          Choose a company, then select its issuer token.
                        </small>
                      </div>
                    </div>
                    <div className={styles.orderFormInputs}>
                      {sectorPicker()}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.catalogueView}>
                <div className={styles.searchBarRow}>
                  <label className={styles.searchBox}>
                    <Search size={15} className={styles.searchIcon} />
                    <input
                      className={styles.searchInput}
                      aria-label="Search sectors"
                      placeholder="Search sectors or stocks (e.g. Healthcare, JNJ, Energy)…"
                      value={sectorSearch}
                      onChange={(event) => setSectorSearch(event.target.value)}
                    />
                  </label>
                  <div className={styles.catalogueStats}>
                    <span>
                      {SECTOR_DEFINITIONS.length} sectors · BSC issuer tokens
                    </span>
                  </div>
                </div>
                <div className={styles.sectorGrid}>
                  {SECTOR_DEFINITIONS.filter((sector) =>
                    `${sector.name} ${sector.sectorName} ${sector.stocks.join(" ")}`
                      .toLowerCase()
                      .includes(sectorSearch.trim().toLowerCase()),
                  ).map((sector) => {
                    const available = sectorTickers(sector.key);
                    const builtCount = available.filter((ticker) => {
                      const def = catalogue.find(
                        (item) => item.ticker === ticker,
                      );
                      return def && builtKinds?.has(def.kind);
                    }).length;
                    return (
                      <button
                        key={sector.key}
                        type="button"
                        className={styles.sectorCard}
                        onClick={() => {
                          setSelectedSector(sector.key);
                          const exact = available.find(
                            (ticker) =>
                              ticker.toLowerCase() ===
                              sectorSearch.trim().toLowerCase(),
                          );
                          setSelectedTicker(exact ?? null);
                          setIssuerAddress(null);
                          setSectorSearch("");
                        }}
                      >
                        <div className={styles.sectorCardSpriteBox}>
                          <img
                            src={sprite(sector.image)}
                            alt={sector.name}
                            className={styles.sectorCardSprite}
                          />
                        </div>
                        <div className={styles.sectorCardContent}>
                          <div className={styles.sectorCardTop}>
                            <span
                              className={styles.sectorBadgeTag}
                              style={{
                                background: `${sector.color}22`,
                                color: sector.color,
                                border: `1px solid ${sector.color}44`,
                              }}
                            >
                              {sector.badge}
                            </span>
                            <span className={styles.sectorDeployCount}>
                              {builtCount
                                ? `${builtCount} / ${available.length} Built`
                                : `${available.length} Stocks`}
                            </span>
                          </div>
                          <strong className={styles.sectorCardTitle}>
                            {sector.name}
                          </strong>
                          <p className={styles.sectorCardDesc}>
                            {sector.description}
                          </p>
                          <div className={styles.sectorStockListSummary}>
                            <span>
                              {available.length
                                ? `${available.slice(0, 4).join(", ")}${available.length > 4 ? ` +${available.length - 4} more` : ""}`
                                : "Issuer tokens unavailable"}
                            </span>
                            <ChevronRight size={13} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          ) : selectedDef ? (
            <div className={styles.orderFormView}>
              <div className={styles.orderFormHeader}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={resetSelection}
                >
                  <ArrowLeft size={15} />
                  <span>Back to all {category}</span>
                </button>
                <div className={styles.treasuryChip}>
                  <span>Wallet Funds:</span>
                  <strong>{funds}</strong>
                </div>
              </div>
              {details()}
            </div>
          ) : (
            <div className={styles.catalogueView}>
              <div className={styles.searchBarRow}>
                <label className={styles.searchBox}>
                  <Search size={15} className={styles.searchIcon} />
                  <input
                    className={styles.searchInput}
                    aria-label={`Search ${category}`}
                    placeholder={`Search ${category}…`}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      className={styles.clearSearchBtn}
                      onClick={() => setSearch("")}
                      aria-label="Clear catalogue search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </label>
                <div className={styles.catalogueStats}>
                  <span>
                    Showing {displayedDefs.length} {category}
                  </span>
                </div>
              </div>
              <div className={styles.verticalGrid}>
                {displayedDefs.map((def) => {
                  const built = Boolean(builtKinds?.has(def.kind));
                  return (
                    <button
                      key={def.kind}
                      type="button"
                      className={`${styles.buildingCard} ${built ? styles.buildingCardBuilt : ""}`}
                      disabled={built && !def.ticker}
                      onClick={() => selectDef(def)}
                    >
                      {built && (
                        <span className={styles.cardBuiltBadge}>
                          <Check size={9} /> Built
                        </span>
                      )}
                      <div className={styles.cardSpriteBox}>
                        <img
                          src={sprite(def.image)}
                          alt={def.name}
                          className={styles.cardSprite}
                        />
                        {def.ticker && (
                          <div className={styles.cardLogoFloating}>
                            <StockLogo
                              ticker={def.ticker}
                              name={def.name}
                              size={18}
                            />
                          </div>
                        )}
                      </div>
                      <div className={styles.cardInfo}>
                        <strong className={styles.cardName}>{def.name}</strong>
                        <div className={styles.cardPriceRow}>
                          <span className={styles.cardPrice}>
                            {def.ticker ? priceFor(def.ticker) : "Free"}
                          </span>
                          {def.ticker && (
                            <span className={styles.cardTickerBadge}>
                              {def.ticker}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!displayedDefs.length && !loading && (
                <p className={styles.signatureNote}>
                  {search
                    ? "No matching companies."
                    : "Issuer tokens unavailable. Try refreshing market data."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MainnetCatalogue;
