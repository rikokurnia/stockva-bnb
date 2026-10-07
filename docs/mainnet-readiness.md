# Mainnet readiness

Recorded 6 October 2026, with read-only source verification at 14:13 Asia/Jakarta. This is an engineering readiness record, not the hackathon Developer Experience Report or proof of a live trade.

## Architecture

BSC mainnet, chain ID 56. A user owns USDT and issuer tokens in the same wallet. Binance Web3 provides discovery, quotes, approval information, and execution data. Wallet signatures authorize each real operation. Existing issuer/DEX contracts execute trades, so Stockva does not need a custom mainnet vault deployment.

The former testnet vault and mUSD ledger are archived. The application must never promote local city records into confirmed wallet holdings. Roads and services cost no real money. Visual building removal never sells a token.

## Evidence obtained

- Official hackathon requirements were read through gstack browse on 6 October 2026.
- Server Binance Web3 credentials resolved 488 verified BSC issuer-token contracts with on-chain decimals during read-only integration checks. Secrets were not printed or sent to the browser.
- Small NVDAB buy quotes at $0.50, $1, and $2, followed by reverse-sell quotes, were returned. Quoted buy-network fees fluctuated between roughly $0.0175 and $0.0249 across repeated checks; one sampled set returned $0.021738, $0.022562, and $0.024815 respectively for those buy amounts. Quotes expire and costs change; these are not a guaranteed minimum or completed fills.
- Unsigned transaction builds and Binance Transaction API dry-runs of exact approvals succeeded for all three sampled buy amounts. The sampled approval consumed an estimated 46,576 gas at 50,000,000 wei/gas, or 0.0000023288 BNB. No approval or trade was broadcast.
- The actual wallet read 0.00215231 BNB and 0 USDT during this check. USDT principal is required before a funded swap dry-run, token receipt, and sell-back can be verified. This balance observation is not a funding destination; verify the connected account in the app before sending funds.
- The tested quote returned a SWAP/LiquidMesh route although the stock-token documentation describes RFQ execution. An initial build using a zero-like probe address returned code 40465, `swap forbidden`. Subsequent unsigned $0.50, $1, and $2 NVDAB builds succeeded for the actual wallet. The wallet has no USDT, so a funded swap dry-run and fill remain pending. Builds and approval simulations do not spend funds.
- The read-only market checker retrieved five actual NVDAB candles from Binance Web3; all five passed observed OHLC/volume schema validation. The latest returned observation was 6 October 2026 at 07:00 UTC (14:00 Asia/Jakarta).
- RFQ signing is disabled until each vendor’s BSC contract/domain and complete order schema have been independently verified. A vendor RFQ route must show unavailable execution rather than ask the wallet to sign partially validated typed data.
- A later wallet check at 21:09 Asia/Jakarta on 6 October 2026 still read 0.00215231 BNB, 0 USDT, and no issuer-token holdings. No live transaction was sent.

## Delivery decision

The owner plans to deploy on Vercel later from a separate repository because the broader project is used for several hackathons. The local migration and [Vercel preparation](vercel-deployment.md) do not constitute a public release. Public delivery and the live round trip remain separate completion requirements.

## Local verification at 21:30 Asia/Jakarta

- All 69 production tests passed. Type checking and the production build passed. Regression checks cover exact approvals, token receipt verification, wallet switching, storage failure after broadcast, cross-tab pending orders, session/expiry binding, and stateless server recovery.
- The running production application resolved all 488 issuer-token contracts. A real browser request for a $0.50 NVDAB purchase returned HTTP 200 for the quote, unsigned build, and exact-approval Transaction API simulation. The sampled expected receipt was 0.002066066580875247 NVDAB; the quoted network fee was $0.02115941. The approval simulation estimated 46,576 gas and 0.0000023288 BNB. No signature or broadcast occurred.
- Browser verification caught and fixed origin validation against Next's internal bind address. Browser Host validation and HTTPS Secure-cookie behavior now support the intended Vercel proxy setup; the public deployment itself remains unverified.
- Desktop and 375px mobile checks covered token search, exact issuer details, disconnected buy-to-funding navigation, wallet login, City Hall, focus restoration, and free civic placement. The catalogue initially renders 24 of 488 tokens with search and a show-more control.
- Provider timestamps remain explicit: missing token-price timestamps are unavailable, and missing token candles produce an empty token chart rather than an underlying-price substitute. A later history response contained underlying references but no accepted token candles; it was displayed as unavailable token history.
- The build retains upstream warnings for Privy's optional Solana/Farcaster module and viem's optional Tempo module. The tested EVM mainnet paths built and ran successfully.

## Required live verification

1. Identify the user's actual BSC mainnet wallet and query its eligibility and balances. Start with a fresh exact-contract buy quote and a reverse-sell quote.
2. If the route can build for that wallet, review required approvals, expected/minimum token receipt, expiry, gas, slippage, and total costs.
3. Dry-run the execution through the Transaction API before signing. A failed simulation or forbidden route must stop execution and retain its error.
4. Fund only the chosen small principal and estimated gas buffer. The current verification request is 1 USDT in the connected BSC wallet; that wallet already has BNB. For a new empty wallet, a provisional target is $1 USDT plus around $1 of BNB already on BSC. Increase only if the real route requires it. Do not assume a $1 total budget has been proven.
5. Buy once with the user's wallet signature. Keep the approval (if needed) and buy transaction hashes. Wait for a successful receipt and refresh the actual issuer-token balance.
6. Quote the confirmed token amount for sale. Review, simulate, approve if required, sign, and keep the sale hash.
7. Verify that the issuer-token amount fell and USDT returned to the same wallet. Record actual gas, principal returned, spread, and any remaining dust. Only then mark the round trip complete.
8. Publish an accessible application and public repository, with reproduction instructions and appropriately redacted transaction evidence. Do not expose private API credentials.

## Blocking evidence

No funded-wallet buy→sell round trip has been recorded in this file. Approval dry-run success is recorded separately above. A funded swap simulation, wallet signature, token receipt, or USDT recovery is not claimed solely because a quote, build, or approval dry-run passed.

A backend configuration failure or provider outage returns unavailable data. A route restriction is preserved. Cached market observations, corporate-reference prices, or historical charts cannot authorize or fabricate an execution.

## Budget interpretation

Funding is different from expenditure. USDT used for a small purchase should largely return after the sale; execution fees, spread, slippage, price movement, and dust reduce what returns. Unused BNB stays in the wallet. Exchange withdrawal fees and bridges may exceed the entire trade budget and are outside the application's gas estimate.

## Data boundaries

Token prices and candles are resolved from the chosen BSC contract. Candle observations retain the provider timestamps; chart gaps are not filled with fabricated paths, wicks, or volume. Delayed underlying references and SEC filings are labelled research data. Reserve attestations apply only to the selected issuer and must not be borrowed from another version of the same stock.
