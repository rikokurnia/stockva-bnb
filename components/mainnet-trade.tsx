"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  bscAddressLink,
  bscTxLink,
  type EvmAddress,
  type MainnetAsset,
  type MainnetReceipt,
  type TradeBuild,
  type WalletBalances,
  type WalletProvider,
} from "../lib/mainnet";
import {
  buildTrade,
  executeReviewedTrade,
  requestTradeQuote,
} from "../lib/trading-client";
import MainnetDialog from "./mainnet-dialog";
import styles from "./mainnet-city.module.css";

export default function MainnetTrade({
  asset,
  side,
  account,
  holding,
  balance,
  getProvider,
  onReceipt,
  onClose,
}: {
  asset: MainnetAsset;
  side: "buy" | "sell";
  account: EvmAddress;
  holding: string;
  balance: WalletBalances | null;
  getProvider: () => Promise<WalletProvider>;
  onReceipt: (r: MainnetReceipt) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(side === "buy" ? "1" : holding);
  const [build, setBuild] = useState<TradeBuild | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [receipt, setReceipt] = useState<MainnetReceipt | null>(null);
  const [clock, setClock] = useState(Date.now());
  const requestId = useRef(0);
  const executingRef = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      requestId.current++;
    };
  }, []);
  const expired = build ? clock >= new Date(build.expiresAt).getTime() : false;
  const refresh = async () => {
    if (loading || executingRef.current) return;
    const id = ++requestId.current;
    setLoading(true);
    setBuild(null);
    setError(null);
    try {
      const quote = await requestTradeQuote({
        account,
        assetAddress: asset.address,
        side,
        amount,
      });
      const result = await buildTrade(quote.quoteId, quote.recoveryToken);
      if (id !== requestId.current) return;
      setBuild(result);
    } catch (e) {
      if (id === requestId.current)
        setError(
          e instanceof Error ? e.message : "Could not build this trade.",
        );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };
  const execute = async () => {
    if (!build || expired || executingRef.current) return;
    executingRef.current = true;
    setExecuting(true);
    setError(null);
    setStage("Checking connected wallet…");
    const pending: MainnetReceipt = {
      quoteId: build.quoteId,
      account,
      asset,
      side,
      status: "PENDING",
      orderId: null,
      txHash: null,
      fromAmount: null,
      toAmount: null,
      fromFormatted: null,
      toFormatted: null,
      createdAt: new Date().toISOString(),
      filledAt: null,
      error: null,
      recoveryToken: build.recoveryToken,
    };
    let submittedOrder: MainnetReceipt | null = null;
    try {
      const provider = await getProvider();
      const result = await executeReviewedTrade(build, provider, (progress) => {
        setStage(progress.stage);
        if (progress.approvalHash) pending.approvalHash = progress.approvalHash;
        if (progress.txHash) pending.txHash = progress.txHash;
        if (progress.receipt) {
          submittedOrder = progress.receipt;
          setReceipt(progress.receipt);
          onReceipt(progress.receipt);
        } else if (pending.txHash || pending.approvalHash)
          onReceipt({ ...pending });
      });
      setReceipt(result);
      onReceipt(result);
      setBuild(null);
      if (result.status !== "FILLED")
        setStage("Order submitted. Check City Hall for its confirmed status.");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Trade was not completed.";
      setError(message);
      // A broadcast hash is evidence of a pending order; never offer another buy until it is reconciled.
      if (pending.txHash || submittedOrder) {
        const recovery = submittedOrder ?? pending;
        setReceipt({ ...recovery, error: message });
        onReceipt({ ...recovery, error: message });
      } else if (pending.approvalHash) {
        const approvedOnly = {
          ...pending,
          status: "CANCELLED" as const,
          error:
            "An approval transaction was sent, but no trade was submitted. Check the approval receipt and review a fresh quote before trading.",
        };
        setReceipt(approvedOnly);
        onReceipt(approvedOnly);
      }
      setBuild(null);
    } finally {
      executingRef.current = false;
      setExecuting(false);
    }
  };
  const quote = build?.quote;
  const availableRaw =
    side === "buy"
      ? balance?.usdt.raw
      : balance?.holdings.find(
          (h) => h.asset.address.toLowerCase() === asset.address.toLowerCase(),
        )?.raw;
  const funded =
    !!quote &&
    availableRaw !== undefined &&
    BigInt(availableRaw) >= BigInt(quote.fromAmount) &&
    BigInt(balance?.bnb.raw ?? "0") > BigInt(0);
  return (
    <MainnetDialog
      title={`${side === "buy" ? "Buy" : "Sell"} ${asset.symbol}`}
      onClose={onClose}
      busy={executing}
    >
      <div className={styles.tradeIdentity}>
        <strong>{asset.name}</strong>
        <span>{asset.platform} · spot · BSC 56</span>
        <a
          href={bscAddressLink(asset.address)}
          target="_blank"
          rel="noreferrer"
        >
          Verify token <ExternalLink size={12} />
        </a>
      </div>
      {receipt?.status === "FILLED" ? (
        <div className={styles.success}>
          <CheckCircle2 size={24} />
          <h3>Trade confirmed</h3>
          <p>
            Spent {receipt.fromFormatted}{" "}
            {side === "buy" ? "USDT" : asset.symbol}. Received{" "}
            {receipt.toFormatted} {side === "buy" ? asset.symbol : "USDT"} in
            your wallet.
          </p>
          {receipt.txHash && (
            <a
              href={bscTxLink(receipt.txHash)}
              target="_blank"
              rel="noreferrer"
            >
              View mainnet receipt <ExternalLink size={14} />
            </a>
          )}
          <button className={styles.primary} onClick={onClose}>
            Back to city
          </button>
        </div>
      ) : (
        <>
          <label className={styles.inputLabel}>
            {side === "buy" ? "Spend USDT" : `Sell ${asset.symbol}`}
            <input
              inputMode="decimal"
              value={amount}
              disabled={executing || !!receipt?.txHash}
              onChange={(e) => {
                requestId.current++;
                setAmount(e.target.value);
                setBuild(null);
                setLoading(false);
                setError(null);
              }}
              aria-label={
                side === "buy"
                  ? "Amount of USDT to spend"
                  : "Token quantity to sell"
              }
            />
          </label>
          {side === "sell" && (
            <p className={styles.muted}>
              Wallet holding: {holding} {asset.symbol}{" "}
              <button
                onClick={() => {
                  requestId.current++;
                  setAmount(holding);
                  setBuild(null);
                  setLoading(false);
                  setError(null);
                }}
                disabled={executing}
              >
                Use all
              </button>
            </p>
          )}
          {!receipt?.txHash && (
            <button
              className={styles.secondary}
              onClick={refresh}
              disabled={loading || executing || !amount}
            >
              {loading ? (
                <Loader2 size={15} className={styles.spin} />
              ) : (
                <RefreshCw size={15} />
              )}{" "}
              {loading
                ? "Checking live route…"
                : build
                  ? "Refresh quote"
                  : "Get live quote"}
            </button>
          )}
          {quote && (
            <>
              <dl className={styles.quote}>
                <div>
                  <dt>Spend</dt>
                  <dd>
                    {quote.fromFormatted} {quote.fromToken.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Expected receipt</dt>
                  <dd>
                    {quote.toFormatted} {quote.toToken.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Minimum received</dt>
                  <dd>
                    {quote.minimumReceiveFormatted} {quote.toToken.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd>
                    {quote.vendor} · {quote.executionMode}
                  </dd>
                </div>
                <div>
                  <dt>Network fee estimate</dt>
                  <dd>
                    {quote.networkFeeUsd === null
                      ? "Unavailable"
                      : `$${quote.networkFeeUsd}`}
                  </dd>
                </div>
                <div>
                  <dt>Approval gas (additional)</dt>
                  <dd>
                    {build?.approval
                      ? build.approvalGasCostWei
                        ? `${Number(build.approvalGasCostWei) / 1e18} BNB`
                        : "Unavailable"
                      : "No approval needed"}
                  </dd>
                </div>
                <div>
                  <dt>Price impact</dt>
                  <dd>
                    {quote.priceImpactPercent === null
                      ? "Unavailable"
                      : `${quote.priceImpactPercent}%`}
                  </dd>
                </div>
                <div>
                  <dt>Slippage limit</dt>
                  <dd>{quote.slippagePercent}%</dd>
                </div>
                <div>
                  <dt>Quote expires</dt>
                  <dd>
                    {expired
                      ? "Expired. Refresh before signing."
                      : `${Math.max(0, Math.ceil((new Date(build!.expiresAt).getTime() - clock) / 1000))} seconds`}
                  </dd>
                </div>
              </dl>
              <p className={styles.muted}>
                Your wallet receives the tokens directly. Review every wallet
                prompt. An approval may be required before the trade.
              </p>
              {!funded && (
                <p className={styles.warning}>
                  Refresh your wallet balances and ensure you have enough{" "}
                  {side === "buy" ? "USDT" : asset.symbol} plus BNB before
                  signing.
                </p>
              )}
              <button
                className={styles.primary}
                onClick={execute}
                disabled={expired || executing || !!receipt?.txHash || !funded}
              >
                {executing ? (
                  <Loader2 size={16} className={styles.spin} />
                ) : null}
                {executing ? stage : `Confirm ${side} in wallet`}
              </button>
            </>
          )}
          {executing && !quote && <p role="status">{stage}</p>}
          {receipt?.txHash && (
            <div className={styles.warning}>
              <p>
                This trade is pending. Its final result must be checked before
                placing another order.
              </p>
              <a
                href={bscTxLink(receipt.txHash)}
                target="_blank"
                rel="noreferrer"
              >
                Check broadcast transaction
              </a>
              <button onClick={onClose}>Open City Hall</button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </MainnetDialog>
  );
}
