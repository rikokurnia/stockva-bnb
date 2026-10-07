import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createHash } from "node:crypto";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
} from "viem";
import { ERC20_ABI, USDT_ADDRESS } from "../lib/mainnet.ts";
import {
  amountToUnits,
  buildTrade,
  checkedAddress,
  createTradeQuote,
  fillFromLogs,
  requireQuoteRecord,
  simulateTrade,
  trackSwap,
  tradeStatus,
  tradingBody,
  tradingCookie,
  tradingSession,
  validateApproval,
  validateRfqTypedData,
  validateRoute,
  validateSimulation,
  validateSwapTransaction,
} from "../lib/trading-server.ts";
import { signBinanceRequest } from "../lib/binance-web3.ts";
const account = "0xD4fBF8cC8dCE27A877baf65fd49461DBF150cf3a";
const assetAddress = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const router = "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5";
const fromAmount = "1000000000000000000",
  toAmount = "4000000000000000";
const asset = {
  address: assetAddress,
  chainId: 56,
  ticker: "NVDA",
  symbol: "NVDAB",
  name: "NVIDIA (bStocks)",
  platform: "bstock",
  decimals: 18,
  priceUsd: "250",
  referencePriceUsd: "250",
  priceUpdatedAt: null,
  fetchedAt: new Date().toISOString(),
  marketStatus: null,
  tradingOpen: true,
  tokenToShareRatio: "1",
  logoUrl: null,
};
const q = {
  quoteId: "reviewed-test",
  account,
  asset,
  side: "buy",
  executionMode: "SWAP",
  vendor: "LiquidMesh",
  fromToken: { address: USDT_ADDRESS, symbol: "USDT", decimals: 18 },
  toToken: { address: assetAddress, symbol: "NVDAB", decimals: 18 },
  fromAmount,
  toAmount,
  minimumReceive: "3980000000000000",
  approveTarget: router,
  expiresAt: new Date(Date.now() + 10000).toISOString(),
  slippagePercent: "0.5",
};
const route = {
  binanceChainId: "56",
  fromToken: {
    tokenContractAddress: USDT_ADDRESS,
    decimal: "18",
    isHoneyPot: false,
    taxRate: "0",
  },
  toToken: {
    tokenContractAddress: assetAddress,
    decimal: "18",
    isHoneyPot: false,
    taxRate: "0",
  },
  fromTokenAmount: fromAmount,
  toTokenAmount: toAmount,
  vendorName: "LiquidMesh",
  executionMode: "SWAP",
  priceImpactPercent: "-0.01",
};
const expected = {
  from: USDT_ADDRESS,
  to: assetAddress,
  amount: fromAmount,
  fromDecimals: 18,
  toDecimals: 18,
};
test("BSC USDT uses verified 18-decimal units and rejects excess precision, floats and zero", () => {
  assert.equal(amountToUnits("0.5", 18), "500000000000000000");
  assert.equal(amountToUnits("1", 18), fromAmount);
  for (const value of [
    "0",
    "-1",
    "1e18",
    "NaN",
    "0.0000000000000000001",
    "01",
    1,
  ])
    assert.throws(() => amountToUnits(value, 18));
  assert.throws(() =>
    checkedAddress("0x0000000000000000000000000000000000000000"),
  );
});
test("route is bound to exact mainnet contract pair, decimal units, amount, vendor and fees", () => {
  assert.doesNotThrow(() => validateRoute(route, expected));
  for (const patch of [
    { binanceChainId: "97" },
    { fromTokenAmount: "2" },
    { toTokenAmount: "0" },
    { vendorName: "untrusted" },
    { priceImpactPercent: "1.01" },
    { feeAmount: "1" },
    { fromToken: { ...route.fromToken, decimal: "6" } },
    { toToken: { ...route.toToken, tokenContractAddress: router } },
    { toToken: { ...route.toToken, isHoneyPot: true } },
    { toToken: { ...route.toToken, taxRate: "0.01" } },
  ])
    assert.throws(() => validateRoute({ ...route, ...patch }, expected));
});
test("approval is exact amount to vendor spender; unlimited and wrong targets rejected", () => {
  const encode = (spender, amount) =>
    encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, BigInt(amount)],
    });
  assert.equal(
    validateApproval(encode(router, fromAmount), router, fromAmount),
    encode(router, fromAmount),
  );
  assert.throws(() =>
    validateApproval(encode(account, fromAmount), router, fromAmount),
  );
  assert.throws(() =>
    validateApproval(
      encode(router, ((1n << 256n) - 1n).toString()),
      router,
      fromAmount,
    ),
  );
  assert.throws(() =>
    validateApproval("0xa9059cbb" + "0".repeat(128), router, fromAmount),
  );
});
test("swap cannot redirect native funds, sender, recipient router or slippage", () => {
  const tx = {
    from: account,
    to: router,
    data: "0x12345678",
    value: "0",
    slippagePercent: "0.5",
    minReceiveAmount: q.minimumReceive,
  };
  assert.doesNotThrow(() => validateSwapTransaction(tx, q));
  for (const patch of [
    { from: router },
    { to: account },
    { value: "1" },
    { minReceiveAmount: "1" },
    { slippagePercent: "50" },
    { data: "0xnope" },
  ])
    assert.throws(() => validateSwapTransaction({ ...tx, ...patch }, q));
});
test("unverified RFQ domains and protocol-specific order fields fail before asking any signature", () => {
  for (const vendor of ["CowSwap", "InchFusion", "PcsXRfq"])
    assert.throws(
      () =>
        validateRfqTypedData(
          {
            domain: { chainId: 56, verifyingContract: router },
            types: { Order: [] },
            primaryType: "Order",
            message: {},
          },
          { ...q, vendor, executionMode: "RFQ" },
        ),
      /unavailable.*verified/,
    );
});
test("dry run must confirm exact allowance or wallet spends/output; status success alone is insufficient", () => {
  const approval = {
    status: "SUCCESS",
    failReason: null,
    allowanceChanges: [
      {
        owner: account,
        tokenAddress: USDT_ADDRESS,
        spender: router,
        postAmount: fromAmount,
      },
    ],
  };
  assert.doesNotThrow(() =>
    validateSimulation(approval, q, "approval", router),
  );
  assert.throws(() =>
    validateSimulation(
      {
        ...approval,
        allowanceChanges: [
          { ...approval.allowanceChanges[0], postAmount: "2" },
        ],
      },
      q,
      "approval",
      router,
    ),
  );
  const swap = {
    status: "SUCCESS",
    failReason: null,
    balanceChanges: [
      {
        owner: account,
        contractAddress: USDT_ADDRESS,
        tokenType: "ERC20",
        change: "-" + fromAmount,
      },
      {
        owner: account,
        contractAddress: assetAddress,
        tokenType: "ERC20",
        change: toAmount,
      },
    ],
  };
  assert.doesNotThrow(() => validateSimulation(swap, q, "swap"));
  assert.throws(() =>
    validateSimulation(
      {
        ...swap,
        balanceChanges: [
          swap.balanceChanges[0],
          { ...swap.balanceChanges[1], owner: router },
        ],
      },
      q,
      "swap",
    ),
  );
  assert.throws(() =>
    validateSimulation({ ...swap, failReason: "reverted" }, q, "swap"),
  );
  assert.throws(() =>
    validateSimulation(
      {
        ...swap,
        balanceChanges: [
          ...swap.balanceChanges,
          {
            owner: account,
            contractAddress: router,
            tokenType: "ERC20",
            change: "-1",
          },
        ],
      },
      q,
      "swap",
    ),
  );
});
function transfer(token, from, to, value) {
  return {
    address: token,
    topics: encodeEventTopics({
      abi: ERC20_ABI,
      eventName: "Transfer",
      args: { from, to },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [BigInt(value)]),
  };
}
test("filled receipt requires actual net token transfer into signing wallet and exact spend", () => {
  const logs = [
    transfer(USDT_ADDRESS, account, router, fromAmount),
    transfer(assetAddress, router, account, toAmount),
  ];
  assert.deepEqual(fillFromLogs(logs, q), { fromAmount, toAmount });
  assert.throws(() =>
    fillFromLogs(
      [logs[0], transfer(assetAddress, router, router, toAmount)],
      q,
    ),
  );
  assert.throws(() =>
    fillFromLogs([transfer(USDT_ADDRESS, account, router, "2"), logs[1]], q),
  );
  assert.throws(() =>
    fillFromLogs(
      [...logs, transfer(assetAddress, account, router, toAmount)],
      q,
    ),
  );
});
test("quote records cannot cross browser sessions and expired quotes cannot build/submit", () => {
  const session = "a".repeat(64),
    hash = createHash("sha256").update(session).digest("hex");
  globalThis.stockvaTrades.set(q.quoteId, {
    session: hash,
    quote: q,
    retainUntil: Date.now() + 10000,
  });
  assert.equal(requireQuoteRecord(q.quoteId, session).quote.quoteId, q.quoteId);
  assert.throws(
    () => requireQuoteRecord(q.quoteId, "b".repeat(64)),
    /browser session/,
  );
  globalThis.stockvaTrades.get(q.quoteId).quote = {
    ...q,
    expiresAt: new Date(Date.now() - 1).toISOString(),
  };
  assert.throws(() => requireQuoteRecord(q.quoteId, session), /expired/);
  assert.doesNotThrow(() => requireQuoteRecord(q.quoteId, session, false));
  globalThis.stockvaTrades.delete(q.quoteId);
});
test("trade POSTs require exact origin and reject arbitrary passthrough fields", async () => {
  const req = (body, origin = "https://stockva.app") =>
    new Request("https://stockva.app/api/trading/submit", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.deepEqual(await tradingBody(req({ quoteId: "q" }), ["quoteId"]), {
    quoteId: "q",
  });
  await assert.rejects(
    tradingBody(req({ quoteId: "q" }, "https://evil.example"), ["quoteId"]),
    /application/,
  );
  await assert.rejects(
    tradingBody(
      req({ quoteId: "q", vendor: "arbitrary", signedTransaction: "0x" }),
      ["quoteId"],
    ),
    /parameters/,
  );
  assert.throws(
    () => tradingSession(new Request("https://stockva.app")),
    /browser session/,
  );
});
test("Binance signature includes exact canonical path and POST bytes", () => {
  assert.notEqual(
    signBinanceRequest(
      "test",
      "timestamp",
      "POST",
      "/build/path",
      '{"amount":"1"}',
    ),
    signBinanceRequest(
      "test",
      "timestamp",
      "POST",
      "/build/path",
      '{"amount":"2"}',
    ),
  );
  assert.notEqual(
    signBinanceRequest("test", "timestamp", "GET", "/build/path?a=1"),
    signBinanceRequest("test", "timestamp", "GET", "/path?a=1"),
  );
});

test("same-origin trade validation uses browser Host behind Next bind addresses and Vercel TLS", async () => {
  const request = (url, headers) =>
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ quoteId: "q" }),
    });
  const local = request("http://0.0.0.0:3011/api/trading/build", {
    host: "localhost:3011",
    origin: "http://localhost:3011",
  });
  assert.deepEqual(await tradingBody(local, ["quoteId"]), { quoteId: "q" });
  assert.doesNotMatch(tradingCookie("a".repeat(64), local), /; Secure/);
  const deployed = request("http://internal:3000/api/trading/build", {
    host: "stockva.vercel.app",
    "x-forwarded-proto": "https",
    "x-forwarded-host": "ignored.example",
    origin: "https://stockva.vercel.app",
  });
  assert.deepEqual(await tradingBody(deployed, ["quoteId"]), { quoteId: "q" });
  assert.match(tradingCookie("a".repeat(64), deployed), /; Secure$/);
  await assert.rejects(
    tradingBody(
      request("http://0.0.0.0:3011/api/trading/build", {
        host: "localhost:3011",
        origin: "http://evil.example",
      }),
      ["quoteId"],
    ),
    /application/,
  );
  for (const headers of [
    { host: "stockva.vercel.app,evil.example" },
    { host: "stockva.vercel.app@evil.example" },
    { host: "stockva.vercel.app/path" },
    { host: "stockva..vercel.app" },
    { host: "stockva.vercel.app:99999" },
    { "x-forwarded-proto": "https,http" },
    { "x-forwarded-proto": "ftp" },
  ])
    await assert.rejects(
      tradingBody(
        request("http://internal:3000/api/trading/build", {
          host: "stockva.vercel.app",
          origin: "https://stockva.vercel.app",
          "x-forwarded-proto": "https",
          ...headers,
        }),
        ["quoteId"],
      ),
      /Invalid application host or protocol/,
    );
  await assert.rejects(
    tradingBody(
      request("http://internal:3000/api/trading/build", {
        host: "stockva.vercel.app",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.example",
        origin: "https://evil.example",
      }),
      ["quoteId"],
    ),
    /application/,
  );
});
test("encrypted recovery survives server state loss and rejects tampering, swapped quote IDs and other sessions", async () => {
  const previous = process.env.STOCKVA_TRADING_SESSION_SECRET;
  process.env.STOCKVA_TRADING_SESSION_SECRET = "test-only-recovery-key";
  const session = "c".repeat(64),
    hash = createHash("sha256").update(session).digest("hex");
  const quote = {
    ...q,
    quoteId: "recovery-quote",
    expiresAt: new Date(Date.now() - 1).toISOString(),
  };
  globalThis.stockvaTrades.set(quote.quoteId, {
    session: hash,
    quote,
    retainUntil: Date.now() + 10000,
    requestId: "stable-idempotency-key",
  });
  try {
    const status = await tradeStatus(quote.quoteId, session);
    assert.equal(status.status, "EXPIRED");
    assert.equal(typeof status.recoveryToken, "string");
    globalThis.stockvaTrades.delete(quote.quoteId);
    assert.equal(
      (await tradeStatus(quote.quoteId, session, status.recoveryToken)).status,
      "EXPIRED",
    );
    globalThis.stockvaTrades.delete(quote.quoteId);
    await assert.rejects(
      tradeStatus(quote.quoteId, "d".repeat(64), status.recoveryToken),
      /another browser session/,
    );
    await assert.rejects(
      tradeStatus("other-quote", session, status.recoveryToken),
      /different quote/,
    );
    const token = status.recoveryToken;
    const mutated =
      token.slice(0, 40) + (token[40] === "A" ? "B" : "A") + token.slice(41);
    await assert.rejects(
      tradeStatus(quote.quoteId, session, mutated),
      /invalid/,
    );
  } finally {
    globalThis.stockvaTrades.delete(quote.quoteId);
    if (previous === undefined)
      delete process.env.STOCKVA_TRADING_SESSION_SECRET;
    else process.env.STOCKVA_TRADING_SESSION_SECRET = previous;
  }
});

test("quote, build, simulation and tracked receipt recover across independent workers without nested tickets", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = Object.fromEntries(
    [
      "STOCKVA_TRADING_SESSION_SECRET",
      "BINANCE_WEB3_API_KEY",
      "BINANCE_WEB3_API_SECRET",
    ].map((key) => [key, process.env[key]]),
  );
  process.env.STOCKVA_TRADING_SESSION_SECRET = "test-only-stateless-secret";
  process.env.BINANCE_WEB3_API_KEY = "test-key";
  process.env.BINANCE_WEB3_API_SECRET = "test-secret";
  const session = "e".repeat(64);
  const txHash = "0x" + "7".repeat(64);
  const decimalData = encodeAbiParameters([{ type: "uint256" }], [18n]);
  const approvalData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [router, BigInt(fromAmount)],
  });
  const builtRoute = { ...route, approveTarget: router };
  const decodeTicket = (token) => {
    const blob = Buffer.from(token, "base64url");
    const key = createHash("sha256")
      .update("stockva-recovery-v1:test-only-stateless-secret")
      .digest();
    const dec = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
    dec.setAuthTag(blob.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([dec.update(blob.subarray(28)), dec.final()]).toString(),
    );
  };
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.startsWith("https://web3.binance.com/build")) {
      const path = new URL(url).pathname;
      let data;
      if (path.endsWith("/market/rwa/tokens"))
        data = [
          {
            binanceChainId: "56",
            platformId: "bstock",
            tokenContractAddress: assetAddress,
            underlyingTicker: "NVDA",
            tokenSymbol: "NVDAB",
            tokenName: "NVIDIA (bStocks)",
            decimals: "18",
            tokenPrice: "250",
            statusInfo: { openState: true },
          },
        ];
      else if (path.endsWith("/aggregator/quote"))
        data = [{ ...builtRoute, quoteId: "vendor-quote" }];
      else if (path.endsWith("/aggregator/swap"))
        data = {
          executionMode: "SWAP",
          routerResult: builtRoute,
          tx: {
            from: account,
            to: router,
            data: "0x12345678",
            value: "0",
            slippagePercent: "0.5",
            minReceiveAmount: q.minimumReceive,
          },
        };
      else if (path.endsWith("/aggregator/approve-transaction"))
        data = [{ dexContractAddress: router, data: approvalData }];
      else if (path.endsWith("/pre-transaction/simulate"))
        data =
          JSON.parse(options.body).evmTx.data === approvalData
            ? {
                status: "SUCCESS",
                allowanceChanges: [
                  {
                    tokenAddress: USDT_ADDRESS,
                    owner: account,
                    spender: router,
                    postAmount: fromAmount,
                  },
                ],
              }
            : {
                status: "SUCCESS",
                balanceChanges: [
                  {
                    owner: account,
                    contractAddress: USDT_ADDRESS,
                    tokenType: "ERC20",
                    change: "-" + fromAmount,
                  },
                  {
                    owner: account,
                    contractAddress: assetAddress,
                    tokenType: "ERC20",
                    change: toAmount,
                  },
                ],
              };
      else throw new Error("Unexpected Binance test request: " + path);
      return Response.json({ code: 0, data });
    }
    const request = JSON.parse(options.body);
    const answer = (rpc) => {
      let result;
      if (rpc.method === "eth_chainId") result = "0x38";
      else if (rpc.method === "eth_call") {
        const data = rpc.params[0].data;
        if (data.startsWith("0x82ad56cb"))
          result = encodeAbiParameters(
            [
              {
                type: "tuple[]",
                components: [
                  { name: "success", type: "bool" },
                  { name: "returnData", type: "bytes" },
                ],
              },
            ],
            [[{ success: true, returnData: decimalData }]],
          );
        else if (data.startsWith("0x313ce567")) result = decimalData;
        else if (data.startsWith("0xdd62ed3e"))
          result = encodeAbiParameters([{ type: "uint256" }], [0n]);
        else throw new Error("Unexpected test eth_call: " + data);
      } else if (rpc.method === "eth_estimateGas") result = "0xb5f0";
      else if (rpc.method === "eth_gasPrice") result = "0x2faf080";
      else if (rpc.method === "eth_getTransactionByHash")
        result = {
          hash: txHash,
          from: account,
          to: router,
          input: "0x12345678",
          value: "0x0",
          chainId: "0x38",
          blockHash: null,
          blockNumber: null,
          transactionIndex: null,
          nonce: "0x1",
          gas: "0x6ddd0",
          gasPrice: "0x2faf080",
          type: "0x0",
          v: "0x94",
          r: "0x" + "1".repeat(64),
          s: "0x" + "2".repeat(64),
        };
      else if (rpc.method === "eth_getTransactionReceipt") result = null;
      else throw new Error("Unexpected test RPC method: " + rpc.method);
      return { jsonrpc: "2.0", id: rpc.id, result };
    };
    return Response.json(
      Array.isArray(request) ? request.map(answer) : answer(request),
    );
  };
  let quoteId;
  try {
    const quote = await createTradeQuote(
      { account, assetAddress, side: "buy", amount: "1" },
      session,
    );
    quoteId = quote.quoteId;
    assert.equal(typeof quote.recoveryToken, "string");
    assert.ok(quote.recoveryToken.length < 28000);
    globalThis.stockvaTrades.delete(quoteId);
    await assert.rejects(
      buildTrade(quoteId, "f".repeat(64), quote.recoveryToken),
      /another browser session/,
    );
    await assert.rejects(
      buildTrade("different-quote", session, quote.recoveryToken),
      /different quote/,
    );
    const build = await buildTrade(quoteId, session, quote.recoveryToken);
    assert.equal(build.transaction.chainId, 56);
    assert.equal(build.approvalAmount, fromAmount);
    const decoded = decodeTicket(build.recoveryToken);
    assert.equal(decoded.quote.recoveryToken, undefined);
    assert.equal(decoded.build.quote.recoveryToken, undefined);
    assert.equal(decoded.build.recoveryToken, "");
    globalThis.stockvaTrades.delete(quoteId);
    const rebuilt = await buildTrade(quoteId, session, build.recoveryToken);
    assert.ok(rebuilt.recoveryToken.length > 0);
    assert.deepEqual(rebuilt.transaction, build.transaction);
    globalThis.stockvaTrades.delete(quoteId);
    const dryRun = await simulateTrade(
      quoteId,
      "approval",
      session,
      build.recoveryToken,
    );
    assert.equal(dryRun.status, "SUCCESS");
    assert.equal(dryRun.gasEstimate, "46576");
    assert.equal(typeof dryRun.recoveryToken, "string");
    globalThis.stockvaTrades.delete(quoteId);
    const swapRun = await simulateTrade(
      quoteId,
      "swap",
      session,
      dryRun.recoveryToken,
    );
    assert.equal(swapRun.status, "SUCCESS");
    globalThis.stockvaTrades.delete(quoteId);
    const tracked = await trackSwap(
      quoteId,
      txHash,
      session,
      swapRun.recoveryToken,
    );
    assert.equal(tracked.txHash, txHash);
    // Another worker has the older initial quote but no build or transaction.
    globalThis.stockvaTrades.set(quoteId, decodeTicket(quote.recoveryToken));
    const pending = await tradeStatus(quoteId, session, tracked.recoveryToken);
    assert.equal(pending.status, "PENDING");
    assert.equal(pending.txHash, txHash);
    globalThis.stockvaTrades.delete(quoteId);
    assert.equal(
      (await tradeStatus(quoteId, session, pending.recoveryToken)).txHash,
      txHash,
    );
    // An older pending ticket cannot replace an already confirmed result.
    const terminal = {
      ...decodeTicket(pending.recoveryToken),
      receipt: {
        ...pending,
        status: "FILLED",
        filledAt: new Date().toISOString(),
      },
    };
    globalThis.stockvaTrades.set(quoteId, terminal);
    assert.equal(
      (await tradeStatus(quoteId, session, tracked.recoveryToken)).status,
      "FILLED",
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (quoteId) globalThis.stockvaTrades.delete(quoteId);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("restored signing work still rejects expired quotes, changed tickets and oversized recovery payloads", async () => {
  const previous = process.env.STOCKVA_TRADING_SESSION_SECRET;
  process.env.STOCKVA_TRADING_SESSION_SECRET = "test-only-expiry-secret";
  const session = "9".repeat(64);
  const hash = createHash("sha256").update(session).digest("hex");
  const quote = {
    ...q,
    quoteId: "stateless-expired",
    expiresAt: new Date(Date.now() - 1).toISOString(),
  };
  globalThis.stockvaTrades.set(quote.quoteId, {
    session: hash,
    quote,
    retainUntil: Date.now() + 10000,
  });
  try {
    const hint = await tradeStatus(quote.quoteId, session);
    globalThis.stockvaTrades.delete(quote.quoteId);
    await assert.rejects(
      buildTrade(quote.quoteId, session, hint.recoveryToken),
      /expired/,
    );
    await assert.rejects(
      simulateTrade(quote.quoteId, "approval", session, hint.recoveryToken),
      /expired/,
    );
    await assert.rejects(
      buildTrade(quote.quoteId, session, "a".repeat(28001)),
      /Invalid trade recovery/,
    );
    const changed =
      hint.recoveryToken.slice(0, 40) +
      (hint.recoveryToken[40] === "A" ? "B" : "A") +
      hint.recoveryToken.slice(41);
    await assert.rejects(
      buildTrade(quote.quoteId, session, changed),
      /invalid/,
    );
    globalThis.stockvaTrades.set(quote.quoteId, {
      session: hash,
      quote: { ...quote, asset: { ...asset, name: "x".repeat(50000) } },
      retainUntil: Date.now() + 10000,
    });
    await assert.rejects(
      tradeStatus(quote.quoteId, session),
      /payload exceeds/,
    );
  } finally {
    globalThis.stockvaTrades.delete(quote.quoteId);
    if (previous === undefined)
      delete process.env.STOCKVA_TRADING_SESSION_SECRET;
    else process.env.STOCKVA_TRADING_SESSION_SECRET = previous;
  }
});
