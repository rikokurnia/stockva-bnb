import { decodeFunctionData, getAddress } from "viem";
import { receiptKey, unresolvedWalletTrade } from "./city-mainnet.ts";
import {
  ERC20_ABI,
  assertWallet,
  ensureBscMainnet,
  getMainnetClient,
  type EvmAddress,
  type MainnetAsset,
  type MainnetReceipt,
  type TradeBuild,
  type TradeQuote,
  type WalletBalances,
  type WalletProvider,
} from "./mainnet.ts";

async function api<T>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? `Mainnet service returned HTTP ${response.status}.`,
    );
  return result as T;
}
const recoveryKey = (quoteId: string) => `stockva:trade-recovery:${quoteId}`;
function savedTrade(quoteId: string): {
  recoveryToken?: string;
  txHash?: EvmAddress;
} {
  try {
    return JSON.parse(localStorage.getItem(recoveryKey(quoteId)) ?? "{}");
  } catch {
    return {};
  }
}
function saveTrade(
  quoteId: string,
  fields: { recoveryToken?: string; txHash?: EvmAddress },
  required = true,
) {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(
      recoveryKey(quoteId),
      JSON.stringify({ ...savedTrade(quoteId), ...fields }),
    );
    return true;
  } catch {
    if (required)
      throw new Error(
        "Your browser cannot save transaction recovery. Enable storage before signing.",
      );
    return false;
  }
}
export async function getTradingAssets(): Promise<MainnetAsset[]> {
  return (await api<{ assets: MainnetAsset[] }>("/api/trading/assets")).assets;
}
export function getWalletBalances(
  account: EvmAddress,
): Promise<WalletBalances> {
  return api(`/api/wallet/balances?account=${encodeURIComponent(account)}`);
}
export function requestTradeQuote(input: {
  account: EvmAddress;
  assetAddress: EvmAddress;
  side: "buy" | "sell";
  amount: string;
}): Promise<TradeQuote> {
  return api("/api/trading/quote", input);
}
export async function buildTrade(
  quoteId: string,
  recoveryToken?: string,
): Promise<TradeBuild> {
  const build = await api<TradeBuild>("/api/trading/build", {
    quoteId,
    ...(recoveryToken ? { recoveryToken } : {}),
  });
  saveTrade(quoteId, { recoveryToken: build.recoveryToken });
  return build;
}
export async function submitTrade(
  quoteId: string,
  userSignature: string,
): Promise<MainnetReceipt> {
  const receipt = await api<MainnetReceipt>("/api/trading/submit", {
    quoteId,
    userSignature,
  });
  saveTrade(quoteId, { recoveryToken: receipt.recoveryToken }, false);
  return receipt;
}
export async function getTradeStatus(
  quoteId: string,
  recoveryToken?: string,
  txHash?: EvmAddress,
): Promise<MainnetReceipt> {
  const saved = savedTrade(quoteId);
  let token = recoveryToken ?? saved.recoveryToken;
  const hash = txHash ?? saved.txHash;
  if (hash) {
    const tracked = await trackWithRetry(quoteId, hash, token);
    token = tracked.recoveryToken ?? token;
    saveTrade(quoteId, { txHash: hash, recoveryToken: token }, false);
  }
  const receipt = await api<MainnetReceipt>("/api/trading/status", {
    quoteId,
    ...(token ? { recoveryToken: token } : {}),
  });
  if (receipt.recoveryToken)
    saveTrade(quoteId, { recoveryToken: receipt.recoveryToken }, false);
  return receipt;
}
export type TradeProgress = {
  stage: string;
  approvalHash?: EvmAddress;
  txHash?: EvmAddress;
  receipt?: MainnetReceipt;
};

/** Publish broadcast evidence before attempting fallible browser persistence. */
export function recordBroadcast(
  build: TradeBuild,
  txHash: EvmAddress,
  onProgress: (progress: TradeProgress) => void,
  approvalHash?: EvmAddress,
) {
  onProgress({
    stage: "Mainnet transaction broadcast. Waiting for settlement…",
    approvalHash,
    txHash,
  });
  if (
    !saveTrade(
      build.quoteId,
      { txHash, recoveryToken: build.recoveryToken },
      false,
    )
  ) {
    onProgress({
      stage:
        "Transaction broadcast. Browser recovery could not be saved; keep this transaction hash.",
      approvalHash,
      txHash,
    });
  }
}
async function trackWithRetry(
  quoteId: string,
  txHash: EvmAddress,
  recoveryToken?: string,
): Promise<MainnetReceipt> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await api<MainnetReceipt>("/api/trading/track", {
        quoteId,
        txHash,
        ...(recoveryToken ? { recoveryToken } : {}),
      });
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(
    "Transaction propagation could not be checked. Keep the broadcast hash and check City Hall.",
  );
}
function unexpired(build: TradeBuild) {
  if (Date.parse(build.expiresAt) <= Date.now())
    throw new Error(
      "Quote expired. Review a fresh quote. Any confirmed approval remains in your wallet.",
    );
}
const locks = new Set<string>();
/** Every wallet prompt follows a live account check and dry run. No automatic requote/signing. */
export async function executeReviewedTrade(
  build: TradeBuild,
  provider: WalletProvider,
  onProgress: (progress: TradeProgress) => void = () => {},
): Promise<MainnetReceipt> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(
      `stockva:wallet-execution:${build.quote.account.toLowerCase()}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock)
          throw new Error(
            "This wallet has a trade open in another tab. Reconcile it before starting another.",
          );
        return executeTradeLocked(build, provider, onProgress);
      },
    );
  }
  throw new Error(
    "This browser cannot safely coordinate wallet execution across tabs. Use a current Chrome, Firefox or Safari browser.",
  );
}
async function executeTradeLocked(
  build: TradeBuild,
  provider: WalletProvider,
  onProgress: (progress: TradeProgress) => void,
): Promise<MainnetReceipt> {
  const q = build.quote;
  const key = `${q.account.toLowerCase()}:${q.quoteId}`;
  let walletHistory: unknown;
  try {
    walletHistory = JSON.parse(
      localStorage.getItem(receiptKey(q.account)) ?? "[]",
    );
  } catch {
    throw new Error(
      "Wallet order history cannot be checked. Restore browser storage before signing.",
    );
  }
  if (unresolvedWalletTrade(walletHistory, q.account, q.quoteId))
    throw new Error(
      "This wallet has an unresolved trade. Check its recorded transaction in City Hall before starting another.",
    );
  if (locks.has(key) || savedTrade(q.quoteId).txHash)
    throw new Error(
      "This trade has already started. Check its recorded transaction before retrying.",
    );
  locks.add(key);
  let approvalHash: EvmAddress | undefined;
  let broadcastHash: EvmAddress | undefined;
  let latestRecoveryToken = build.recoveryToken;
  try {
    unexpired(build);
    await ensureBscMainnet(provider);
    await assertWallet(provider, q.account);
    saveTrade(q.quoteId, { recoveryToken: build.recoveryToken });
    const client = getMainnetClient();
    const [balance, bnb] = await Promise.all([
      client.readContract({
        address: q.fromToken.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [q.account],
      }),
      client.getBalance({ address: q.account }),
    ]);
    await assertWallet(provider, q.account);
    unexpired(build);
    if (balance < BigInt(q.fromAmount))
      throw new Error(`Insufficient ${q.fromToken.symbol} in this wallet.`);
    if (bnb === BigInt(0))
      throw new Error("BNB is needed in this wallet for gas.");
    if (build.approval && build.approvalSpender) {
      const allowance = await client.readContract({
        address: q.fromToken.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [q.account, build.approvalSpender],
      });
      await assertWallet(provider, q.account);
      unexpired(build);
      if (allowance < BigInt(q.fromAmount)) {
        const tx = build.approval;
        const decoded = decodeFunctionData({ abi: ERC20_ABI, data: tx.data });
        if (
          decoded.functionName !== "approve" ||
          getAddress(decoded.args![0]) !== getAddress(build.approvalSpender) ||
          decoded.args![1] !== BigInt(q.fromAmount) ||
          getAddress(tx.to) !== getAddress(q.fromToken.address) ||
          tx.value !== "0"
        )
          throw new Error(
            "Approval is inconsistent with the reviewed amount and spender.",
          );
        onProgress({
          stage: `Dry-running exact ${q.fromToken.symbol} approval…`,
        });
        await api("/api/trading/simulate", {
          quoteId: q.quoteId,
          kind: "approval",
          recoveryToken: build.recoveryToken,
        });
        await assertWallet(provider, q.account);
        unexpired(build);
        if (savedTrade(q.quoteId).txHash)
          throw new Error("A transaction is already recorded for this quote.");
        onProgress({
          stage: `Approve exactly ${q.fromFormatted} ${q.fromToken.symbol} in your wallet…`,
        });
        approvalHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: tx.from,
              to: tx.to,
              data: tx.data,
              value: "0x0",
              chainId: "0x38",
            },
          ],
        })) as EvmAddress;
        onProgress({
          stage: "Waiting for approval confirmation…",
          approvalHash,
        });
        const approvalReceipt = await client.waitForTransactionReceipt({
          hash: approvalHash,
          confirmations: 2,
          timeout: 120_000,
        });
        if (approvalReceipt.status !== "success")
          throw new Error("Approval reverted. No trade was sent.");
        await assertWallet(provider, q.account);
        unexpired(build);
        const confirmed = await client.readContract({
          address: q.fromToken.address,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [q.account, build.approvalSpender],
        });
        if (confirmed < BigInt(q.fromAmount))
          throw new Error(
            "Approval receipt did not establish the required allowance.",
          );
      }
    }
    if (build.executionMode === "SWAP") {
      const tx = build.transaction;
      if (!tx) throw new Error("Reviewed swap payload is missing.");
      onProgress({
        stage: "Dry-running the trade and wallet token receipt…",
        approvalHash,
      });
      await api("/api/trading/simulate", {
        quoteId: q.quoteId,
        kind: "swap",
        recoveryToken: build.recoveryToken,
      });
      await assertWallet(provider, q.account);
      unexpired(build);
      if (savedTrade(q.quoteId).txHash)
        throw new Error("A transaction is already recorded for this quote.");
      onProgress({
        stage: "Confirm the reviewed mainnet trade in your wallet…",
        approvalHash,
      });
      const txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: tx.from,
            to: tx.to,
            data: tx.data,
            value: "0x0",
            chainId: "0x38",
          },
        ],
      })) as EvmAddress;
      broadcastHash = txHash;
      recordBroadcast(build, txHash, onProgress, approvalHash);
      const pending = await trackWithRetry(
        q.quoteId,
        txHash,
        build.recoveryToken,
      );
      latestRecoveryToken = pending.recoveryToken ?? latestRecoveryToken;
      saveTrade(q.quoteId, { recoveryToken: pending.recoveryToken }, false);
      onProgress({
        stage: "Verifying the mainnet receipt…",
        approvalHash,
        txHash,
        receipt: { ...pending, approvalHash },
      });
    } else {
      if (!build.typedData)
        throw new Error("Reviewed EIP-712 order is missing.");
      await assertWallet(provider, q.account);
      unexpired(build);
      onProgress({
        stage: "Sign the reviewed token order in your wallet…",
        approvalHash,
      });
      const userSignature = (await provider.request({
        method: "eth_signTypedData_v4",
        params: [q.account, JSON.stringify(build.typedData)],
      })) as string;
      await assertWallet(provider, q.account);
      unexpired(build);
      const pending: MainnetReceipt = {
        quoteId: q.quoteId,
        account: q.account,
        asset: q.asset,
        side: q.side,
        status: "PENDING",
        orderId: null,
        txHash: null,
        approvalHash,
        fromAmount: null,
        toAmount: null,
        fromFormatted: null,
        toFormatted: null,
        createdAt: q.createdAt,
        filledAt: null,
        error: null,
        recoveryToken: build.recoveryToken,
      };
      onProgress({
        stage: "Submitting the signed order…",
        approvalHash,
        receipt: pending,
      });
      const receipt = await submitTrade(q.quoteId, userSignature);
      onProgress({
        stage: "Waiting for vendor settlement…",
        approvalHash,
        receipt: { ...receipt, approvalHash },
      });
    }
    for (let attempt = 0; attempt < 25; attempt++) {
      const receipt = await getTradeStatus(
        q.quoteId,
        latestRecoveryToken,
        broadcastHash,
      );
      latestRecoveryToken = receipt.recoveryToken ?? latestRecoveryToken;
      onProgress({
        stage:
          receipt.status === "FILLED"
            ? "Trade confirmed in your wallet."
            : "Waiting for mainnet settlement…",
        approvalHash,
        txHash: receipt.txHash ?? undefined,
        receipt: { ...receipt, approvalHash },
      });
      if (receipt.status !== "PENDING") return { ...receipt, approvalHash };
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return { ...(await getTradeStatus(q.quoteId)), approvalHash };
  } finally {
    locks.delete(key);
  }
}
