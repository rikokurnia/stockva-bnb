# stockva-bnb

Stockva makes a BSC mainnet tokenized-stock wallet visible as an isometric city. Buy an issuer token with USDT, place its building after the wallet balance confirms, and sell that token back into USDT in the same wallet. Roads and city services are free visual features.

This folder is the mainnet application. It does not use the old mUSD faucet or simulation vault for trades. No custom contract deployment is needed: issuer tokens stay in the connected wallet and execution uses existing Binance Web3 routes on BNB Smart Chain, chain ID 56.

## Mainnet behavior

- Token discovery uses Binance Web3 RWA data and exact BSC contracts for Ondo, bStocks, or xStocks. Issuer, symbol, contract, and decimals are kept together; tokens from different issuers are separate assets.
- Each buy or sell requests an executable quote for that exact contract and wallet. Approvals and execution need explicit wallet signatures; a market observation is never used as settlement input.
- Wallet USDT, BNB, and issuer-token quantities are read from BSC. Order status, transaction receipt, and refreshed balances determine the confirmed state.
- Buildings represent confirmed wallet holdings. Removing a visual building leaves its tokens in the wallet. A sale is a separate reviewed transaction.
- Prices and histories come from real BSC provider observations. Missing sources show unavailable data. Underlying stock research is labelled separately and cannot replace a token execution price.
- The optional Cokoo advisor analyses wallet context. It cannot sign trades, run an autonomous strategy, or schedule purchases.

## Run locally

Use Node.js 22.18 or newer and an EVM browser wallet.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_PRIVY_APP_ID`, configure the local and deployed origins in Privy, and add the server-only `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_API_SECRET`. Never put secrets in a `NEXT_PUBLIC_` variable. Optional RPC URLs must point to BSC mainnet.

Open [the city](http://localhost:3000/city). Connect a wallet and confirm BNB Smart Chain, chain ID 56. Fund that wallet with USDT and BNB on BSC. Assets on Ethereum or another network are not spendable here.

## Verification

```bash
npm test
npm run typecheck
npm run build
# Optional read-only Binance/BSC source check (requires server credentials)
npm run check:market
npm run check:mainnet -- YOUR_WALLET_ADDRESS 0.5 1
```

The production test command checks mainnet layout and runtime safety, provider data parsing, trading validation, and reusable research/UI logic. `npm run test:legacy` preserves the historical simulation tests as migration references; their old economics and testnet assumptions do not define mainnet behavior.

To build while a development server is open, use a separate output directory:

```bash
STOCKCITY_NEXT_DIST_DIR=.next-production npm run build
STOCKCITY_NEXT_DIST_DIR=.next-production npm run start -- --port 3001
```

A passing build or successful quote is not proof of a completed trade. Before presenting the app as a verified live product, finish the small mainnet round trip described in [mainnet readiness](docs/mainnet-readiness.md), keep both transaction hashes, and confirm the returned USDT balance.

The owner will deploy later from a separate repository. [Vercel preparation](docs/vercel-deployment.md) records the environment, session recovery, and release checks.

## Costs and current limits

A sensible first funding target is $1 of BSC USDT plus roughly $1 of BNB for gas. This is a funding budget, not an expected loss: most trade principal should return as USDT after selling, subject to the actual route, fees, spread, and market movement. There is no verified universal minimum. Network and funding fees outside BSC are additional.

Read-only checks have obtained small bStock buy and reverse-sell quotes, and unsigned transaction builds plus exact-approval dry runs succeeded for the actual wallet. The wallet needs USDT before a funded swap dry-run and live fill can be verified. RFQ execution remains disabled until complete vendor-specific signing adapters are verified. Route restrictions must be reported explicitly rather than replaced with local holdings. See [the evidence and remaining work](docs/mainnet-readiness.md).

## Hackathon

The [official Tokenized Stocks Edition rules](https://www.bnbchain.org/en/hackathons/tokenized-stocks?tab=resources) require a working Binance Web3 API integration, BSC mainnet, a central bStocks/Ondo/xStocks use case, spot only, and a small live demonstration after transaction dry runs. A public repository, accessible demo/deployed link or reproducible judge instructions, and a human-written Developer Experience Report are submission requirements. The demo video is optional but strongly recommended, with a four-minute limit.

The [submission checklist](docs/hackathon-checklist.md) tracks completion honestly. It does not claim a live trade, deployment, or accepted submission that has not happened.

## Archived contracts

`contracts/` contains the old testnet simulation ledger for historical reference. It accepts caller-supplied prices and was designed for freely minted mUSD. It must not custody real collateral or be deployed as the mainnet stock-trading system. Mainnet trading does not import its writes or use its addresses.

## Stack

Next.js 15, React 19, TypeScript, Privy, viem, Binance Web3 RWA/Market/Trading/Transaction APIs, and lightweight-charts. Corporate filings and news are independent research sources.
