import { createPublicClient, fallback, getAddress, http, parseAbi } from "viem";
import { bsc } from "viem/chains";

export const BSC_CHAIN_ID = 56 as const;
export const BSC_RPC = "https://bsc-dataseed.binance.org";
export const BSC_EXPLORER_URL = "https://bscscan.com";
export const USDT_ADDRESS =
  "0x55d398326f99059fF775485246999027B3197955" as const;
export const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
export type EvmAddress = `0x${string}`;
export type MainnetAsset = {
  address: EvmAddress;
  chainId: 56;
  ticker: string;
  symbol: string;
  name: string;
  platform: "ondo" | "bstock" | "xstocks";
  decimals: number;
  priceUsd: string | null;
  referencePriceUsd: string | null;
  priceUpdatedAt: string | null;
  fetchedAt: string;
  marketStatus: string | null;
  tradingOpen: boolean;
  tokenToShareRatio: string | null;
  logoUrl: string | null;
};
export type WalletBalances = {
  chainId: 56;
  account: EvmAddress;
  fetchedAt: string;
  bnb: { raw: string; formatted: string };
  usdt: {
    address: EvmAddress;
    decimals: number;
    raw: string;
    formatted: string;
  };
  holdings: { asset: MainnetAsset; raw: string; formatted: string }[];
};
export type TradeQuote = {
  quoteId: string;
  account: EvmAddress;
  asset: MainnetAsset;
  side: "buy" | "sell";
  executionMode: "RFQ" | "SWAP";
  vendor: string;
  fromToken: { address: EvmAddress; symbol: string; decimals: number };
  toToken: { address: EvmAddress; symbol: string; decimals: number };
  fromAmount: string;
  toAmount: string;
  fromFormatted: string;
  toFormatted: string;
  minimumReceive: string;
  minimumReceiveFormatted: string;
  networkFeeUsd: string | null;
  priceImpactPercent: string | null;
  slippagePercent: "0.5";
  approveTarget: EvmAddress | null;
  expiresAt: string;
  createdAt: string;
  recoveryToken?: string;
};
export type ReviewedTransaction = {
  chainId: 56;
  from: EvmAddress;
  to: EvmAddress;
  data: EvmAddress;
  value: "0";
};
export type TradeBuild = {
  quoteId: string;
  quote: TradeQuote;
  executionMode: "RFQ" | "SWAP";
  approval: ReviewedTransaction | null;
  approvalSpender: EvmAddress | null;
  approvalAmount: string;
  approvalGasEstimate: string | null;
  approvalGasCostWei: string | null;
  expiresAt: string;
  transaction: ReviewedTransaction | null;
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  } | null;
  recoveryToken: string;
};
export type MainnetReceipt = {
  quoteId: string;
  account: EvmAddress;
  asset: MainnetAsset;
  side: "buy" | "sell";
  status: "PENDING" | "FILLED" | "FAILED" | "EXPIRED" | "CANCELLED";
  orderId: string | null;
  txHash: EvmAddress | null;
  approvalHash?: EvmAddress;
  fromAmount: string | null;
  toAmount: string | null;
  fromFormatted: string | null;
  toFormatted: string | null;
  createdAt: string;
  filledAt: string | null;
  error: string | null;
  recoveryToken?: string;
};
export type WalletProvider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
};
export const bscTxLink = (hash: string) => `${BSC_EXPLORER_URL}/tx/${hash}`;
export const bscAddressLink = (address: string) =>
  `${BSC_EXPLORER_URL}/address/${address}`;
export function getMainnetClient() {
  const configured =
    typeof window === "undefined"
      ? process.env.BSC_MAINNET_RPC_URL
      : process.env.NEXT_PUBLIC_BSC_RPC_URL;
  return createPublicClient({
    chain: bsc,
    transport: fallback([
      http(configured || BSC_RPC, { timeout: 12_000, retryCount: 1 }),
      http("https://bsc-rpc.publicnode.com", {
        timeout: 12_000,
        retryCount: 1,
      }),
    ]),
  });
}
export async function ensureBscMainnet(
  provider: WalletProvider,
): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x38" }],
    });
  } catch (error) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x38",
          chainName: "BNB Smart Chain",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: [BSC_RPC],
          blockExplorerUrls: [BSC_EXPLORER_URL],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x38" }],
    });
  }
  if (
    Number(await provider.request({ method: "eth_chainId" })) !== BSC_CHAIN_ID
  )
    throw new Error("Switch your wallet to BNB Smart Chain mainnet.");
}
export async function assertWallet(
  provider: WalletProvider,
  account: EvmAddress,
): Promise<void> {
  const chain = await provider.request({ method: "eth_chainId" });
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];
  if (
    Number(chain) !== BSC_CHAIN_ID ||
    !accounts[0] ||
    getAddress(accounts[0]) !== getAddress(account)
  )
    throw new Error("Wallet account or network changed. Review a fresh quote.");
}
