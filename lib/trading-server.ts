// Only API routes/server data modules import this file. No keys or custody on the client.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  recoverTypedDataAddress,
} from "viem";
import { binanceRequest, TradingError } from "./binance-web3.ts";
import {
  BSC_CHAIN_ID,
  ERC20_ABI,
  USDT_ADDRESS,
  getMainnetClient,
  type EvmAddress,
  type MainnetAsset,
  type MainnetReceipt,
  type ReviewedTransaction,
  type TradeBuild,
  type TradeQuote,
  type WalletBalances,
} from "./mainnet.ts";

type Row = Record<string, unknown>;
type TradeRecord = {
  session: string;
  quote: TradeQuote;
  vendorQuoteId: string;
  requestId: string;
  build?: TradeBuild;
  rfqOrderId?: string;
  signingScheme?: string;
  receipt?: MainnetReceipt;
  submitting?: boolean;
  submissionSignature?: string;
  retainUntil: number;
};
const state = globalThis as typeof globalThis & {
  stockvaTrades?: Map<string, TradeRecord>;
};
const trades = (state.stockvaTrades ??= new Map<string, TradeRecord>());
const COOKIE = "stockva_trade_session";
const LIQUIDMESH_ROUTER = "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5";
const vendors = new Set(["LiquidMesh", "InchFusion", "CowSwap", "PcsXRfq"]);
const plain = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
export function checkedAddress(value: unknown): EvmAddress {
  if (
    typeof value !== "string" ||
    !isAddress(value, { strict: false }) ||
    /^0x0{40}$/i.test(value)
  )
    throw new TradingError("A valid wallet/token address is required.");
  return getAddress(value);
}
const sameAddress = (a: unknown, b: unknown) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
export function integerAmount(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,77}$/.test(value) ||
    BigInt(value) > (1n << 256n) - 1n
  )
    throw new TradingError("Invalid token amount.");
  return value;
}
export function amountToUnits(amount: unknown, decimals: number): string {
  if (
    typeof amount !== "string" ||
    !/^(?:0|[1-9]\d{0,20})(?:\.\d{1,36})?$/.test(amount) ||
    (amount.split(".")[1]?.length ?? 0) > decimals
  )
    throw new TradingError(
      `Enter a positive amount with at most ${decimals} decimal places.`,
    );
  return integerAmount(parseUnits(amount, decimals).toString());
}
const positive = (value: unknown) =>
  typeof value === "string" &&
  /^(?:\d+)(?:\.\d+)?$/.test(value) &&
  Number(value) > 0
    ? value
    : null;
const sessionHash = (session: string) =>
  createHash("sha256").update(session).digest("hex");
export function tradingSession(request: Request, create = false): string {
  const session = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (session && /^[a-f0-9]{64}$/.test(session)) return session;
  if (!create)
    throw new TradingError(
      "This trade belongs to another browser session. Reconnect and request a fresh quote.",
      403,
    );
  return randomBytes(32).toString("hex");
}
function canonicalRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? url.protocol.slice(0, -1);
  const host = request.headers.get("host") ?? url.host;
  // Next's internal URL may use its 0.0.0.0 bind address or HTTP behind
  // Vercel TLS. Host is the browser's destination; forwarded host is ignored.
  if (
    !["http", "https"].includes(protocol) ||
    !/^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::\d{1,5})?$/.test(host)
  )
    throw new TradingError("Invalid application host or protocol.", 403);
  let origin: URL;
  try {
    origin = new URL(`${protocol}://${host}`);
  } catch {
    throw new TradingError("Invalid application host or protocol.", 403);
  }
  // Reject non-canonical IPv4 forms and malformed DNS labels. Explicit
  // default ports remain valid and are normalized by URL.origin.
  const hostname = origin.hostname;
  const unportedHost = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.split(":")[0];
  if (
    hostname.toLowerCase() !== unportedHost.toLowerCase() ||
    (!hostname.startsWith("[") &&
      hostname
        .split(".")
        .some(
          (label) =>
            !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label),
        ))
  )
    throw new TradingError("Invalid application host or protocol.", 403);
  return origin.origin;
}
export function tradingCookie(session: string, request: Request) {
  return `${COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${canonicalRequestOrigin(request).startsWith("https:") ? "; Secure" : ""}`;
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== canonicalRequestOrigin(request))
    throw new TradingError(
      "Trade requests must come from this application.",
      403,
    );
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json"))
    throw new TradingError("JSON content is required.", 415);
}
export async function tradingBody(
  request: Request,
  allowed: string[],
): Promise<Row> {
  requireSameOrigin(request);
  if (Number(request.headers.get("content-length") ?? 0) > 32_000)
    throw new TradingError("Trade request is too large.", 413);
  const raw = await request.text();
  if (raw.length > 32_000)
    throw new TradingError("Trade request is too large.", 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TradingError("Invalid JSON request.");
  }
  const body = plain(parsed);
  if (
    !parsed ||
    Array.isArray(parsed) ||
    typeof parsed !== "object" ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new TradingError("Unsupported trade parameters.");
  return body;
}
function ticketKey() {
  const secret =
    process.env.STOCKVA_TRADING_SESSION_SECRET ||
    process.env.BINANCE_WEB3_API_SECRET;
  if (!secret)
    throw new TradingError("Trading session configuration is missing.", 503);
  return createHash("sha256")
    .update("stockva-recovery-v1:" + secret)
    .digest();
}
function recoveryTicket(record: TradeRecord) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ticketKey(), iv);
  const quote = { ...record.quote, recoveryToken: undefined };
  const copy = {
    ...record,
    quote,
    build: record.build
      ? { ...record.build, quote, recoveryToken: "" }
      : undefined,
    receipt: record.receipt
      ? { ...record.receipt, recoveryToken: undefined }
      : undefined,
    submitting: undefined,
  };
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(copy)),
    cipher.final(),
  ]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString(
    "base64url",
  );
  if (token.length > 28_000)
    throw new TradingError(
      "This route's recovery payload exceeds the safe request size. No wallet signature was requested.",
      422,
    );
  return token;
}
function recoverRecord(token: unknown, session: string): TradeRecord {
  if (typeof token !== "string" || token.length > 28_000)
    throw new TradingError("Invalid trade recovery ticket.", 403);
  try {
    const blob = Buffer.from(token, "base64url");
    const dec = createDecipheriv(
      "aes-256-gcm",
      ticketKey(),
      blob.subarray(0, 12),
    );
    dec.setAuthTag(blob.subarray(12, 28));
    const record = JSON.parse(
      Buffer.concat([dec.update(blob.subarray(28)), dec.final()]).toString(),
    ) as TradeRecord;
    if (
      record.session !== sessionHash(session) ||
      record.retainUntil < Date.now()
    )
      throw new Error("session");
    return record;
  } catch {
    throw new TradingError(
      "The recovery ticket is invalid or belongs to another browser session.",
      403,
    );
  }
}
export function requireQuoteRecord(
  quoteId: unknown,
  session: string,
  live = true,
): TradeRecord {
  const record = typeof quoteId === "string" ? trades.get(quoteId) : undefined;
  if (
    !record ||
    record.session !== sessionHash(session) ||
    record.retainUntil < Date.now()
  )
    throw new TradingError(
      "Trade quote not found for this browser session. Request a fresh quote.",
      403,
    );
  if (live && Date.parse(record.quote.expiresAt) <= Date.now())
    throw new TradingError(
      "Quote expired. Review a fresh quote before signing.",
      409,
    );
  return record;
}

/** Encrypted tickets carry reviewed state across stateless workers. Never downgrade a settled receipt. */
function resumedQuoteRecord(
  quoteId: unknown,
  session: string,
  live: boolean,
  recoveryToken?: unknown,
): TradeRecord {
  let restored: TradeRecord | undefined;
  if (recoveryToken !== undefined) {
    restored = recoverRecord(recoveryToken, session);
    if (restored.quote.quoteId !== quoteId)
      throw new TradingError(
        "Recovery ticket belongs to a different quote.",
        403,
      );
  }
  let record: TradeRecord;
  try {
    record = requireQuoteRecord(quoteId, session, false);
  } catch (error) {
    if (!restored) throw error;
    record = restored;
    trades.set(record.quote.quoteId, record);
  }
  if (restored && restored !== record) {
    if (
      JSON.stringify({ ...record.quote, recoveryToken: undefined }) !==
      JSON.stringify({ ...restored.quote, recoveryToken: undefined })
    )
      throw new TradingError(
        "Recovery ticket differs from the reviewed quote.",
        403,
      );
    // The caller's sealed build is the exact payload they reviewed. A worker
    // may have independently built the same quote with different vendor calldata.
    if (restored.build && !record.receipt?.txHash)
      record.build = restored.build;
    const known = record.receipt;
    const incoming = restored.receipt;
    if (
      known?.txHash &&
      incoming?.txHash &&
      !sameAddress(known.txHash, incoming.txHash)
    )
      throw new TradingError(
        "A different transaction is already recorded for this quote.",
        409,
      );
    if (
      incoming &&
      (!known ||
        (known.status === "PENDING" &&
          ((!known.txHash && !!incoming.txHash) ||
            (incoming.status !== "PENDING" && !!incoming.txHash))))
    )
      record.receipt = incoming;
  }
  return requireQuoteRecord(quoteId, session, live);
}

let assetsCache: { at: number; assets: MainnetAsset[] } | undefined;
let assetsPromise: Promise<MainnetAsset[]> | undefined;
/** Exact chain/platform/contracts from Binance's RWA catalogue; decimals verified against BSC. */
export async function listMainnetAssets(): Promise<MainnetAsset[]> {
  if (assetsCache && Date.now() - assetsCache.at < 30_000)
    return assetsCache.assets;
  if (assetsPromise) return assetsPromise;
  assetsPromise = (async () => {
    const rows = await binanceRequest<Row[]>("/api/v1/dex/market/rwa/tokens");
    if (!Array.isArray(rows))
      throw new TradingError("Binance returned an invalid RWA catalogue.", 502);
    const matched = rows.filter(
      (row) =>
        String(row.binanceChainId) === "56" &&
        ["ondo", "bstock", "xstocks"].includes(
          text(row.platformId).toLowerCase(),
        ) &&
        isAddress(text(row.tokenContractAddress), { strict: false }) &&
        text(row.underlyingTicker),
    );
    const unique = [
      ...new Map(
        matched.map((row) => [
          text(row.tokenContractAddress).toLowerCase(),
          row,
        ]),
      ).values(),
    ];
    const client = getMainnetClient();
    if ((await client.getChainId()) !== BSC_CHAIN_ID)
      throw new TradingError("RPC is connected to the wrong network.", 503);
    const decimals = await client.multicall({
      contracts: unique.map((row) => ({
        address: getAddress(text(row.tokenContractAddress)),
        abi: ERC20_ABI,
        functionName: "decimals" as const,
      })),
      batchSize: 16_000,
    });
    const fetchedAt = new Date().toISOString();
    const assets = unique.flatMap((row, index): MainnetAsset[] => {
      const result = decimals[index];
      if (
        result.status !== "success" ||
        !Number.isInteger(Number(result.result)) ||
        Number(result.result) > 36
      )
        return [];
      if (Number(row.decimals) !== Number(result.result)) return [];
      const status = plain(row.statusInfo);
      const update = Number(row.tokenPriceUpdatedAt);
      const priceUpdatedAt =
        Number.isFinite(update) && update > 0
          ? new Date(update < 1e12 ? update * 1000 : update).toISOString()
          : null;
      return [
        {
          address: getAddress(text(row.tokenContractAddress)),
          chainId: 56,
          ticker: text(row.underlyingTicker),
          symbol: text(row.tokenSymbol),
          name: text(row.tokenName),
          platform: text(
            row.platformId,
          ).toLowerCase() as MainnetAsset["platform"],
          decimals: Number(result.result),
          priceUsd: positive(row.tokenPrice),
          referencePriceUsd: positive(row.referencePrice),
          priceUpdatedAt,
          fetchedAt,
          marketStatus: text(status.marketStatus) || null,
          tradingOpen: status.openState === true,
          tokenToShareRatio: positive(row.tokenToShareRatio),
          logoUrl: text(row.tokenLogoUrl) || null,
        },
      ];
    });
    if (!assets.length)
      throw new TradingError(
        "No issuer contracts could be verified on BSC mainnet.",
        503,
      );
    const rank = { ondo: 0, bstock: 1, xstocks: 2 };
    assets.sort(
      (a, b) =>
        a.ticker.localeCompare(b.ticker) || rank[a.platform] - rank[b.platform],
    );
    assetsCache = { at: Date.now(), assets };
    return assets;
  })();
  try {
    return await assetsPromise;
  } finally {
    assetsPromise = undefined;
  }
}
export async function readWalletBalances(
  accountValue: unknown,
): Promise<WalletBalances> {
  const account = checkedAddress(accountValue);
  const assets = await listMainnetAssets();
  const client = getMainnetClient();
  const [bnb, usdtDecimals, balances] = await Promise.all([
    client.getBalance({ address: account }),
    client.readContract({
      address: USDT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
    client.multicall({
      contracts: [USDT_ADDRESS, ...assets.map((a) => a.address)].map(
        (address) => ({
          address,
          abi: ERC20_ABI,
          functionName: "balanceOf" as const,
          args: [account],
        }),
      ),
      batchSize: 16_000,
    }),
  ]);
  if (balances.some((b) => b.status !== "success"))
    throw new TradingError(
      "Wallet balances could not be fully read. Try again; no balances were replaced with zero.",
      503,
    );
  const usdt = balances[0].result as bigint;
  return {
    chainId: 56,
    account,
    fetchedAt: new Date().toISOString(),
    bnb: { raw: bnb.toString(), formatted: formatUnits(bnb, 18) },
    usdt: {
      address: USDT_ADDRESS,
      decimals: Number(usdtDecimals),
      raw: usdt.toString(),
      formatted: formatUnits(usdt, Number(usdtDecimals)),
    },
    holdings: assets.flatMap((asset, i) => {
      const raw = balances[i + 1].result as bigint;
      return raw > 0n
        ? [
            {
              asset,
              raw: raw.toString(),
              formatted: formatUnits(raw, asset.decimals),
            },
          ]
        : [];
    }),
  };
}
export function validateRoute(
  route: Row,
  expected: {
    account?: EvmAddress;
    from: EvmAddress;
    to: EvmAddress;
    amount: string;
    fromDecimals: number;
    toDecimals: number;
    vendor?: string;
  },
) {
  if (
    String(route.binanceChainId) !== "56" ||
    !sameAddress(plain(route.fromToken).tokenContractAddress, expected.from) ||
    !sameAddress(plain(route.toToken).tokenContractAddress, expected.to) ||
    route.fromTokenAmount !== expected.amount ||
    Number(plain(route.fromToken).decimal) !== expected.fromDecimals ||
    Number(plain(route.toToken).decimal) !== expected.toDecimals
  )
    throw new TradingError(
      "The returned route does not match the reviewed chain, tokens or amount.",
      502,
    );
  integerAmount(route.toTokenAmount);
  if (
    !vendors.has(text(route.vendorName)) ||
    (expected.vendor && route.vendorName !== expected.vendor)
  )
    throw new TradingError(
      "This route vendor is not supported for verified mainnet execution.",
      422,
    );
  if (
    route.executionMode !== undefined &&
    !["SWAP", "RFQ"].includes(text(route.executionMode))
  )
    throw new TradingError("Unsupported execution mode.", 422);
  if (
    plain(route.fromToken).isHoneyPot === true ||
    plain(route.toToken).isHoneyPot === true ||
    Number(plain(route.fromToken).taxRate ?? 0) !== 0 ||
    Number(plain(route.toToken).taxRate ?? 0) !== 0 ||
    Number(route.feeAmount ?? 0) !== 0
  )
    throw new TradingError(
      "Taxed tokens and additional referral fees are not supported.",
      422,
    );
  if (
    route.priceImpactPercent != null &&
    (!Number.isFinite(Number(route.priceImpactPercent)) ||
      Math.abs(Number(route.priceImpactPercent)) > 1)
  )
    throw new TradingError("Price impact exceeds the 1% safety limit.", 422);
}
export async function createTradeQuote(
  input: Row,
  session: string,
): Promise<TradeQuote> {
  const account = checkedAddress(input.account);
  const address = checkedAddress(input.assetAddress);
  if (input.side !== "buy" && input.side !== "sell")
    throw new TradingError("Choose buy or sell.");
  const asset = (await listMainnetAssets()).find((a) =>
    sameAddress(a.address, address),
  );
  if (!asset)
    throw new TradingError(
      "This contract is not a supported issuer token on BSC mainnet.",
    );
  const usdtDecimals = Number(
    await getMainnetClient().readContract({
      address: USDT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  );
  const fromToken =
    input.side === "buy"
      ? { address: USDT_ADDRESS, symbol: "USDT", decimals: usdtDecimals }
      : {
          address: asset.address,
          symbol: asset.symbol,
          decimals: asset.decimals,
        };
  const toToken =
    input.side === "sell"
      ? { address: USDT_ADDRESS, symbol: "USDT", decimals: usdtDecimals }
      : {
          address: asset.address,
          symbol: asset.symbol,
          decimals: asset.decimals,
        };
  const fromAmount = amountToUnits(input.amount, fromToken.decimals);
  const start = Date.now();
  const routes = await binanceRequest<Row[]>("/api/v1/dex/aggregator/quote", {
    binanceChainId: "56",
    amount: fromAmount,
    fromTokenAddress: fromToken.address,
    toTokenAddress: toToken.address,
    userWalletAddress: account,
  });
  if (!Array.isArray(routes) || !routes.length)
    throw new TradingError(
      "No executable route was returned for this amount. Try a different amount or issuer.",
      422,
    );
  const eligible = routes.filter((route) => {
    try {
      validateRoute(route, {
        from: fromToken.address,
        to: toToken.address,
        amount: fromAmount,
        fromDecimals: fromToken.decimals,
        toDecimals: toToken.decimals,
      });
      return (
        route.executionMode === "SWAP" &&
        route.vendorName === "LiquidMesh" &&
        sameAddress(route.approveTarget, LIQUIDMESH_ROUTER)
      );
    } catch {
      return false;
    }
  });
  eligible.sort((a, b) =>
    BigInt(text(a.toTokenAmount)) > BigInt(text(b.toTokenAmount)) ? -1 : 1,
  );
  const route = eligible[0];
  if (!route)
    throw new TradingError(
      "No supported mainnet route passed the chain, issuer, fee and price-impact checks. RFQ signing remains unavailable until its vendor domain and complete order schema are verified.",
      422,
    );
  const toAmount = integerAmount(route.toTokenAmount);
  const minimumReceive = ((BigInt(toAmount) * 995n) / 1000n).toString();
  integerAmount(minimumReceive);
  const quote: TradeQuote = {
    quoteId: randomUUID(),
    account,
    asset,
    side: input.side,
    executionMode: route.executionMode === "RFQ" ? "RFQ" : "SWAP",
    vendor: text(route.vendorName),
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    fromFormatted: formatUnits(BigInt(fromAmount), fromToken.decimals),
    toFormatted: formatUnits(BigInt(toAmount), toToken.decimals),
    minimumReceive,
    minimumReceiveFormatted: formatUnits(
      BigInt(minimumReceive),
      toToken.decimals,
    ),
    networkFeeUsd: positive(route.tradeFee),
    priceImpactPercent:
      typeof route.priceImpactPercent === "string"
        ? route.priceImpactPercent
        : null,
    slippagePercent: "0.5",
    approveTarget: route.approveTarget
      ? checkedAddress(route.approveTarget)
      : null,
    createdAt: new Date(start).toISOString(),
    expiresAt: new Date(start + 25_000).toISOString(),
  };
  if (Date.parse(quote.expiresAt) <= Date.now())
    throw new TradingError(
      "Route arrived after its quote deadline. Request a fresh quote.",
      409,
    );
  for (const [id, record] of trades)
    if (record.retainUntil < Date.now()) trades.delete(id);
  if (trades.size > 5000)
    throw new TradingError("Trading is busy. Try again shortly.", 503);
  const record: TradeRecord = {
    session: sessionHash(session),
    quote,
    vendorQuoteId: text(route.quoteId),
    requestId: randomUUID(),
    retainUntil: Date.now() + 30 * 86400_000,
  };
  trades.set(quote.quoteId, record);
  return { ...quote, recoveryToken: recoveryTicket(record) };
}
export function validateApproval(
  data: unknown,
  spender: EvmAddress,
  amount: string,
) {
  if (typeof data !== "string" || !/^0x[0-9a-fA-F]{136}$/.test(data))
    throw new TradingError("Invalid approval calldata.", 502);
  const decoded = decodeFunctionData({
    abi: ERC20_ABI,
    data: data as EvmAddress,
  });
  if (
    decoded.functionName !== "approve" ||
    !sameAddress(decoded.args?.[0], spender) ||
    decoded.args?.[1] !== BigInt(amount)
  )
    throw new TradingError(
      "Approval spender or amount differs from the reviewed route.",
      502,
    );
  return data as EvmAddress;
}
export function validateSwapTransaction(
  tx: Row,
  quote: TradeQuote,
): ReviewedTransaction {
  if (
    !sameAddress(tx.from, quote.account) ||
    tx.value !== "0" ||
    tx.slippagePercent !== "0.5" ||
    BigInt(integerAmount(tx.minReceiveAmount)) < BigInt(quote.minimumReceive)
  )
    throw new TradingError(
      "Swap sender, value or minimum output differs from the reviewed quote.",
      502,
    );
  if (
    quote.vendor !== "LiquidMesh" ||
    !sameAddress(tx.to, LIQUIDMESH_ROUTER) ||
    !sameAddress(quote.approveTarget, LIQUIDMESH_ROUTER)
  )
    throw new TradingError(
      "Swap router is not in the reviewed BSC vendor mapping.",
      422,
    );
  const data = text(tx.data);
  if (
    !/^0x[0-9a-fA-F]+$/.test(data) ||
    data.length < 10 ||
    data.length > 25_000 ||
    data.length % 2 !== 0
  )
    throw new TradingError("Invalid swap calldata.", 502);
  return {
    chainId: 56,
    from: quote.account,
    to: checkedAddress(tx.to),
    data: data as EvmAddress,
    value: "0",
  };
}
export function validateRfqTypedData(
  _value: unknown,
  _quote: TradeQuote,
): NonNullable<TradeBuild["typedData"]> {
  // A generic EIP-712 token/amount check cannot prove vendor-specific makerTraits,
  // Permit2 witnesses, contract deployments, expiry or partial-fill semantics.
  // The live bStock LiquidMesh SWAP route is supported; RFQ stays unavailable
  // until each vendor's BSC domain/schema adapter has independent verification.
  throw new TradingError(
    "RFQ execution is unavailable until this vendor's BSC signing domain and complete order schema are verified. No signature was requested.",
    422,
  );
}
export async function buildTrade(
  quoteId: unknown,
  session: string,
  recoveryToken?: unknown,
): Promise<TradeBuild> {
  const record = resumedQuoteRecord(quoteId, session, true, recoveryToken);
  if (record.build) {
    record.build.recoveryToken = recoveryTicket(record);
    return record.build;
  }
  const q = record.quote;
  const built = await binanceRequest<Row>("/api/v1/dex/aggregator/swap", {
    binanceChainId: "56",
    amount: q.fromAmount,
    fromTokenAddress: q.fromToken.address,
    toTokenAddress: q.toToken.address,
    userWalletAddress: q.account,
    quoteId: record.vendorQuoteId,
    slippagePercent: "0.5",
    priceImpactProtectionPercent: "1",
    approveTransaction: "true",
    approveAmount: q.fromAmount,
  });
  const route = plain(built.routerResult);
  validateRoute(route, {
    from: q.fromToken.address,
    to: q.toToken.address,
    amount: q.fromAmount,
    fromDecimals: q.fromToken.decimals,
    toDecimals: q.toToken.decimals,
    vendor: q.vendor,
  });
  if (
    built.executionMode !== q.executionMode ||
    route.toTokenAmount !== q.toAmount
  )
    throw new TradingError(
      "Route changed after review. Request a fresh quote.",
      409,
    );
  let transaction: ReviewedTransaction | null = null;
  let typedData: TradeBuild["typedData"] = null;
  if (q.executionMode === "SWAP")
    transaction = validateSwapTransaction(plain(built.tx), q);
  else {
    const rfq = plain(built.rfq);
    if (rfq.vendor !== q.vendor || rfq.signingScheme !== "EIP712")
      throw new TradingError(
        "RFQ vendor or signing scheme differs from review.",
        502,
      );
    typedData = validateRfqTypedData(rfq.typedDataToSign, q);
    record.rfqOrderId = text(rfq.orderId);
    record.signingScheme = text(rfq.signingScheme);
    if (!record.rfqOrderId)
      throw new TradingError(
        "RFQ build did not return its order identifier.",
        502,
      );
  }
  let approval: ReviewedTransaction | null = null;
  let approvalSpender: EvmAddress | null = q.approveTarget;
  if (approvalSpender) {
    const rows = await binanceRequest<Row[]>(
      "/api/v1/dex/aggregator/approve-transaction",
      {
        binanceChainId: "56",
        tokenContractAddress: q.fromToken.address,
        approveAmount: q.fromAmount,
        vendor: q.vendor,
      },
    );
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      !sameAddress(rows[0].dexContractAddress, approvalSpender)
    )
      throw new TradingError(
        "Approval vendor mapping differs from the quote.",
        502,
      );
    approval = {
      chainId: 56,
      from: q.account,
      to: q.fromToken.address,
      data: validateApproval(rows[0].data, approvalSpender, q.fromAmount),
      value: "0",
    };
  }
  let approvalGasEstimate: string | null = null,
    approvalGasCostWei: string | null = null;
  if (approval && approvalSpender) {
    const client = getMainnetClient();
    const allowance = await client.readContract({
      address: q.fromToken.address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [q.account, approvalSpender],
    });
    if (allowance >= BigInt(q.fromAmount)) approval = null;
    else {
      try {
        const gas = await client.estimateGas({
          account: q.account,
          to: approval.to,
          data: approval.data,
          value: 0n,
        });
        const gasPrice = await client.getGasPrice();
        approvalGasEstimate = gas.toString();
        approvalGasCostWei = (gas * gasPrice).toString();
      } catch {
        /* Unavailable estimates stay explicit; execution still requires a successful dry run. */
      }
    }
  }
  requireQuoteRecord(quoteId, session);
  const build: TradeBuild = {
    quoteId: q.quoteId,
    quote: q,
    executionMode: q.executionMode,
    approval,
    approvalSpender,
    approvalAmount: q.fromAmount,
    approvalGasEstimate,
    approvalGasCostWei,
    expiresAt: q.expiresAt,
    transaction,
    typedData,
    recoveryToken: "",
  };
  record.build = build;
  build.recoveryToken = recoveryTicket(record);
  return build;
}
export function validateSimulation(
  result: Row,
  q: TradeQuote,
  kind: "approval" | "swap",
  spender?: EvmAddress,
) {
  if (result.status !== "SUCCESS" || result.failReason)
    throw new TradingError(
      `Dry run failed: ${text(result.failReason) || text(result.status) || "unknown status"}. No trade was sent.`,
      422,
    );
  if (kind === "approval") {
    const changes = Array.isArray(result.allowanceChanges)
      ? result.allowanceChanges.map(plain)
      : [];
    if (
      changes.length !== 1 ||
      !sameAddress(changes[0].tokenAddress, q.fromToken.address) ||
      !sameAddress(changes[0].owner, q.account) ||
      !sameAddress(changes[0].spender, spender) ||
      String(changes[0].postAmount) !== q.fromAmount
    )
      throw new TradingError(
        "Dry-run approval differs from the exact reviewed allowance.",
        502,
      );
  } else {
    const changes = (
      Array.isArray(result.balanceChanges) ? result.balanceChanges : []
    )
      .map(plain)
      .filter((c) => sameAddress(c.owner, q.account));
    const sum = (token: EvmAddress) =>
      changes
        .filter((c) => sameAddress(c.contractAddress, token))
        .reduce((v, c) => v + BigInt(text(c.change)), 0n);
    if (
      sum(q.fromToken.address) !== -BigInt(q.fromAmount) ||
      sum(q.toToken.address) < BigInt(q.minimumReceive)
    )
      throw new TradingError(
        "Dry run does not deliver the reviewed tokens and minimum output to your wallet.",
        502,
      );
    if (
      changes.some(
        (c) =>
          c.tokenType === "ERC20" &&
          !sameAddress(c.contractAddress, q.fromToken.address) &&
          BigInt(text(c.change)) < 0n,
      )
    )
      throw new TradingError(
        "Dry run attempts to spend an unrelated wallet token.",
        502,
      );
  }
}
export async function simulateTrade(
  quoteId: unknown,
  kind: unknown,
  session: string,
  recoveryToken?: unknown,
) {
  const record = resumedQuoteRecord(quoteId, session, true, recoveryToken);
  const build = record.build;
  if (!build) throw new TradingError("Build and review the trade first.");
  if (kind !== "approval" && kind !== "swap")
    throw new TradingError("Choose a supported dry run.");
  const tx = kind === "approval" ? build.approval : build.transaction;
  if (!tx)
    throw new TradingError("No transaction is available for this dry run.");
  const result = await binanceRequest<Row>(
    "/api/v1/dex/pre-transaction/simulate",
    {},
    {
      binanceChainId: "56",
      evmTx: { from: tx.from, to: tx.to, data: tx.data, value: tx.value },
    },
  );
  validateSimulation(
    result,
    record.quote,
    kind,
    build.approvalSpender ?? undefined,
  );
  const gas = await getMainnetClient().estimateGas({
    account: tx.from,
    to: tx.to,
    data: tx.data,
    value: 0n,
  });
  const gasPrice = await getMainnetClient().getGasPrice();
  requireQuoteRecord(quoteId, session);
  return {
    status: "SUCCESS",
    gasEstimate: gas.toString(),
    gasCostWei: (gas * gasPrice).toString(),
    checkedAt: new Date().toISOString(),
    recoveryToken: recoveryTicket(record),
  };
}
function pendingReceipt(record: TradeRecord): MainnetReceipt {
  const q = record.quote;
  return {
    quoteId: q.quoteId,
    account: q.account,
    asset: q.asset,
    side: q.side,
    status: "PENDING",
    orderId: null,
    txHash: null,
    fromAmount: null,
    toAmount: null,
    fromFormatted: null,
    toFormatted: null,
    createdAt: q.createdAt,
    filledAt: null,
    error: null,
  };
}
function receiptWithTicket(record: TradeRecord) {
  const receipt = record.receipt ?? pendingReceipt(record);
  receipt.recoveryToken = recoveryTicket({ ...record, receipt });
  return receipt;
}
export async function submitTrade(
  quoteId: unknown,
  signatureValue: unknown,
  session: string,
): Promise<MainnetReceipt> {
  const record = requireQuoteRecord(quoteId, session, false);
  if (record.receipt?.orderId) return receiptWithTicket(record);
  requireQuoteRecord(quoteId, session);
  const build = record.build;
  if (
    !build?.typedData ||
    record.quote.executionMode !== "RFQ" ||
    !record.rfqOrderId
  )
    throw new TradingError("This quote is not a reviewed RFQ order.");
  if (
    typeof signatureValue !== "string" ||
    !/^0x[0-9a-fA-F]{130}$/.test(signatureValue)
  )
    throw new TradingError("Invalid EIP-712 signature.");
  const t = build.typedData;
  const signer = await recoverTypedDataAddress({
    domain: t.domain,
    types: t.types,
    primaryType: t.primaryType,
    message: t.message,
    signature: signatureValue as EvmAddress,
  });
  if (!sameAddress(signer, record.quote.account))
    throw new TradingError("RFQ signature belongs to a different wallet.", 403);
  if (record.submitting)
    throw new TradingError(
      "This order is already being submitted. Check its status.",
      409,
    );
  const client = getMainnetClient();
  const balance = await client.readContract({
    address: record.quote.fromToken.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [record.quote.account],
  });
  if (balance < BigInt(record.quote.fromAmount))
    throw new TradingError("Insufficient sell-token balance.", 422);
  if (build.approvalSpender) {
    const allowance = await client.readContract({
      address: record.quote.fromToken.address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [record.quote.account, build.approvalSpender],
    });
    if (allowance < BigInt(record.quote.fromAmount))
      throw new TradingError(
        "The exact token approval has not confirmed.",
        422,
      );
  }
  requireQuoteRecord(quoteId, session);
  record.submitting = true;
  record.submissionSignature = signatureValue;
  record.receipt = pendingReceipt(record);
  try {
    const result = await binanceRequest<Row>(
      "/api/v1/dex/aggregator/order/submit",
      {},
      {
        requestId: record.requestId,
        userSignature: signatureValue,
        vendor: record.quote.vendor,
        quoteId: record.rfqOrderId,
        signingScheme: record.signingScheme,
      },
    );
    if (!text(result.orderId))
      throw new TradingError(
        "Vendor did not return an order ID. Check status before retrying.",
        502,
      );
    record.receipt = {
      ...pendingReceipt(record),
      orderId: text(result.orderId),
    };
    return receiptWithTicket(record);
  } finally {
    record.submitting = false;
  }
}
export async function trackSwap(
  quoteId: unknown,
  hashValue: unknown,
  session: string,
  recoveryToken?: unknown,
): Promise<MainnetReceipt> {
  const record = resumedQuoteRecord(quoteId, session, false, recoveryToken);
  if (record.quote.executionMode !== "SWAP" || !record.build?.transaction)
    throw new TradingError("No reviewed swap transaction exists.");
  if (typeof hashValue !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hashValue))
    throw new TradingError("Invalid transaction hash.");
  if (record.receipt?.txHash && !sameAddress(record.receipt.txHash, hashValue))
    throw new TradingError(
      "A different transaction is already recorded for this quote.",
      409,
    );
  const tx = await getMainnetClient().getTransaction({
    hash: hashValue as EvmAddress,
  });
  const approved = record.build.transaction;
  if (
    !sameAddress(tx.from, approved.from) ||
    !sameAddress(tx.to, approved.to) ||
    tx.input.toLowerCase() !== approved.data.toLowerCase() ||
    tx.value !== 0n ||
    tx.chainId !== 56
  )
    throw new TradingError(
      "Submitted transaction does not match the reviewed swap.",
      403,
    );
  if (record.receipt?.txHash) return receiptWithTicket(record);
  record.receipt = {
    ...pendingReceipt(record),
    txHash: hashValue as EvmAddress,
  };
  return receiptWithTicket(record);
}
export function fillFromLogs(
  logs: {
    address: EvmAddress;
    data: EvmAddress;
    topics: readonly EvmAddress[];
  }[],
  q: TradeQuote,
): { fromAmount: string; toAmount: string } {
  let out = 0n,
    received = 0n;
  for (const log of logs) {
    if (
      !sameAddress(log.address, q.fromToken.address) &&
      !sameAddress(log.address, q.toToken.address)
    )
      continue;
    try {
      const e = decodeEventLog({
        abi: ERC20_ABI,
        data: log.data,
        topics: log.topics as [EvmAddress, ...EvmAddress[]],
      });
      if (e.eventName !== "Transfer") continue;
      if (sameAddress(log.address, q.fromToken.address)) {
        if (sameAddress(e.args.from, q.account)) out += e.args.value;
        if (sameAddress(e.args.to, q.account)) out -= e.args.value;
      }
      if (sameAddress(log.address, q.toToken.address)) {
        if (sameAddress(e.args.to, q.account)) received += e.args.value;
        if (sameAddress(e.args.from, q.account)) received -= e.args.value;
      }
    } catch {
      /* Other events do not prove a fill. */
    }
  }
  if (out !== BigInt(q.fromAmount) || received < BigInt(q.minimumReceive))
    throw new TradingError(
      "Settlement receipt does not confirm the reviewed token spend and received output.",
      502,
    );
  return { fromAmount: out.toString(), toAmount: received.toString() };
}
export async function tradeStatus(
  quoteId: unknown,
  session: string,
  recoveryToken?: unknown,
): Promise<MainnetReceipt> {
  const record = resumedQuoteRecord(quoteId, session, false, recoveryToken);
  if (!record.receipt?.txHash && !record.receipt?.orderId) {
    if (record.submissionSignature) {
      if (!record.submitting) {
        record.submitting = true;
        try {
          const response = await binanceRequest<Row>(
            "/api/v1/dex/aggregator/order/submit",
            {},
            {
              requestId: record.requestId,
              userSignature: record.submissionSignature,
              vendor: record.quote.vendor,
              quoteId: record.rfqOrderId,
              signingScheme: record.signingScheme,
            },
          );
          if (text(response.orderId))
            record.receipt = {
              ...pendingReceipt(record),
              orderId: text(response.orderId),
            };
        } finally {
          record.submitting = false;
        }
      }
      return {
        ...receiptWithTicket(record),
        error: record.receipt?.orderId
          ? null
          : "Signed order submission is unresolved. Reconciliation reuses the same idempotency key; do not place another trade.",
      };
    }
    const expired = Date.parse(record.quote.expiresAt) <= Date.now();
    return {
      ...pendingReceipt(record),
      status: expired ? "EXPIRED" : "PENDING",
      error: expired
        ? "Quote expired before a swap/order was submitted. Any confirmed approval remains on-chain."
        : null,
      recoveryToken: recoveryTicket(record),
    };
  }
  if (record.receipt.status !== "PENDING") return receiptWithTicket(record);
  if (record.receipt.orderId) {
    const status = await binanceRequest<Row>(
      `/api/v1/dex/aggregator/order/${encodeURIComponent(record.receipt.orderId)}`,
    );
    if (status.orderId !== record.receipt.orderId)
      throw new TradingError("Vendor returned status for another order.", 502);
    if (["FAILED", "EXPIRED", "CANCELLED"].includes(text(status.status))) {
      record.receipt = {
        ...record.receipt,
        status: status.status as MainnetReceipt["status"],
        error: `Vendor settlement ${text(status.status).toLowerCase()}.`,
      };
      return receiptWithTicket(record);
    }
    if (status.status !== "FILLED") return receiptWithTicket(record);
    if (!/^0x[0-9a-fA-F]{64}$/.test(text(status.txHash)))
      throw new TradingError(
        "Vendor reports a fill without a transaction receipt.",
        502,
      );
    record.receipt.txHash = text(status.txHash) as EvmAddress;
  }
  const client = getMainnetClient();
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({
      hash: record.receipt.txHash!,
    });
  } catch {
    return receiptWithTicket(record);
  }
  if (receipt.status !== "success") {
    record.receipt = {
      ...record.receipt,
      status: "FAILED",
      error: "Mainnet settlement transaction reverted.",
    };
    return receiptWithTicket(record);
  }
  const currentBlock = await client.getBlockNumber();
  if (currentBlock < receipt.blockNumber + 2n) return receiptWithTicket(record);
  const filled = fillFromLogs(receipt.logs, record.quote);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  record.receipt = {
    ...record.receipt,
    ...filled,
    status: "FILLED",
    fromFormatted: formatUnits(
      BigInt(filled.fromAmount),
      record.quote.fromToken.decimals,
    ),
    toFormatted: formatUnits(
      BigInt(filled.toAmount),
      record.quote.toToken.decimals,
    ),
    filledAt: new Date(Number(block.timestamp) * 1000).toISOString(),
    error: null,
  };
  return receiptWithTicket(record);
}
