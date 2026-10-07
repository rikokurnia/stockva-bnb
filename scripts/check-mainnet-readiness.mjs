// Read-only integration check. Never signs, approves, submits, or broadcasts.
import env from "@next/env";
import { randomBytes } from "node:crypto";
import {
  checkedAddress,
  listMainnetAssets,
  readWalletBalances,
  createTradeQuote,
  buildTrade,
  simulateTrade,
} from "../lib/trading-server.ts";

env.loadEnvConfig(process.cwd());
try {
  const account = checkedAddress(process.argv[2]);
  const assets = await listMainnetAssets();
  const asset = assets.find(
    (a) => a.ticker === "NVDA" && a.platform === "bstock",
  );
  if (!asset) throw new Error("NVDAB's BSC contract could not be verified.");
  const wallet = await readWalletBalances(account);
  const session = randomBytes(32).toString("hex");
  const amounts = process.argv.slice(3).length
    ? process.argv.slice(3)
    : ["0.5", "1", "2"];
  const probes = [];
  for (const amount of amounts) {
    try {
      const quote = await createTradeQuote(
        { account, assetAddress: asset.address, side: "buy", amount },
        session,
      );
      const build = await buildTrade(quote.quoteId, session);
      let approvalDryRun = null,
        swapDryRun = null;
      if (build.approval)
        approvalDryRun = await simulateTrade(
          quote.quoteId,
          "approval",
          session,
        );
      if (
        !build.approval &&
        BigInt(wallet.usdt.raw) >= BigInt(quote.fromAmount)
      ) {
        try {
          swapDryRun = await simulateTrade(quote.quoteId, "swap", session);
        } catch (error) {
          swapDryRun = { error: error.message };
        }
      }
      const reverse = await createTradeQuote(
        {
          account,
          assetAddress: asset.address,
          side: "sell",
          amount: quote.toFormatted,
        },
        session,
      );
      probes.push({
        amountUsdt: amount,
        executionMode: build.executionMode,
        vendor: quote.vendor,
        expectedTokens: quote.toFormatted,
        minimumTokens: quote.minimumReceiveFormatted,
        buyNetworkFeeUsd: quote.networkFeeUsd,
        approvalGasCostWei: build.approvalGasCostWei,
        approvalDryRun,
        swapDryRun,
        swapDryRunPendingReason: swapDryRun
          ? null
          : build.approval
            ? "A confirmed wallet approval is required before a funded swap can be simulated."
            : "This wallet does not have enough USDT for the buy.",
        estimatedReverseUsdt: reverse.toFormatted,
        sellNetworkFeeUsd: reverse.networkFeeUsd,
        recoveryTicketBytes: build.recoveryToken.length,
      });
    } catch (error) {
      probes.push({ amountUsdt: amount, error: error.message });
    }
  }
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        chainId: 56,
        account,
        verifiedAssets: assets.length,
        asset: {
          symbol: asset.symbol,
          contract: asset.address,
          platform: asset.platform,
          decimals: asset.decimals,
        },
        wallet: {
          bnb: wallet.bnb.formatted,
          usdt: wallet.usdt.formatted,
          holdings: wallet.holdings.length,
        },
        probes,
        actualTradesSubmitted: 0,
        minimumConfirmedByLiveTrade: false,
      },
      null,
      2,
    ),
  );
  if (!probes.some((p) => !p.error)) process.exitCode = 1;
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Mainnet readiness check failed.",
  );
  process.exitCode = 1;
}
