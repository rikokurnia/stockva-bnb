# BNB Hack: Tokenized Stocks submission checklist

Verified against the [official resources and rules](https://www.bnbchain.org/en/hackathons/tokenized-stocks?tab=resources) on 6 October 2026. The [announcement](https://www.bnbchain.org/en/blog/bnb-hack-tokenized-stocks-edition-with-binance-web3-wallet) introduces the same event. Submission closes 11 October 2026 at 12:00 UTC, or 19:00 Asia/Jakarta. Recheck the official page before submission.

## Product and track requirements

| Requirement                                                | Implementation or evidence                                                         | Status                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Working project using one or more Binance Web3 API modules | RWA discovery and market data; reviewed trading and transaction integration        | Implemented; funded-wallet execution still pending     |
| bStocks, Ondo, or xStocks central                          | Exact BSC issuer tokens are the tradeable assets and city holdings                 | Implemented                                            |
| BSC mainnet only                                           | Chain ID 56, BSC USDT, real wallet balances; archived simulation vault is not used | Implemented; verify deployed environment               |
| Spot only                                                  | USDT↔issuer-token trades; no derivatives or leverage                               | Implemented                                            |
| Dry-run with Transaction API while developing              | Required simulation gate before wallet execution                                   | Live funded-wallet evidence pending                    |
| Demonstrate with small live amounts                        | One small buy, real token receipt, sell, and returned USDT                         | Pending; record both hashes and balance reconciliation |
| Team eligibility and one entry per team                    | Human registration and jurisdiction confirmation                                   | Owner action required                                  |

Optional Agentic Wallet/Wallet Skills and BNB Agent Studio qualify for special prizes; they are not mandatory track requirements. Stockva's advisory chat should not be described as autonomous execution or as an integration with those products unless the corresponding feature is actually built and demonstrated.

## Submission deliverables

- [ ] Public repository URL with the submitted mainnet implementation.
- [ ] Accessible deployed link, or complete instructions a judge can follow.
- [ ] Small live round-trip evidence and actual costs, with secrets redacted.
- [ ] Demo video of four minutes or less (strongly recommended; optional under the official rules).
- [ ] Developer Experience Report completed by the human builder from their own experience.
- [ ] Submit the project and report through the official forms.
- [ ] Keep the repository, demo, and application available through judging, 12–23 October 2026.

No entry, public deployment, report submission, or live trade is marked complete without evidence.

## Developer Experience Report

The report is mandatory and accounts for 25% of judging. Official rules reject perfunctory or AI-generated reports. This checklist is not a replacement report. The human builder must write the report and provide their actual onboarding timeline and experience.

Keep verifiable notes while testing:

- Time from opening documentation to the first successful API call, plus the actual obstacle encountered.
- Exact documentation URL and section for a discrepancy; include the redacted request/response that demonstrated it.
- API error codes, route restrictions, latency, and reproducible edge cases.
- Whether Wallet Skills, Agentic Wallet, or the CLI were actually used, and what happened. If unused, say so.
- Actual small-trade liquidity, slippage, out-of-hours behavior, token/reference differences, and issuer differences observed.
- Specific redesign suggestions and requested endpoints or SDK features based on those observations.

A concrete observation available for the human builder to independently verify is the NVDAB route that returned SWAP/LiquidMesh while the stock documentation describes RFQ. A zero-like probe address initially returned `40465 swap forbidden`; subsequent unsigned builds and exact-approval simulations for the actual wallet succeeded, while funded swap dry runs remain pending because USDT is absent. The report should explain the actual distinction and include independently checked request evidence. These engineering notes must not be presented as the human builder’s own experience without verification.

## Judge reproduction

1. Open the submitted mainnet city and connect an eligible wallet.
2. Verify chain ID 56 and real USDT/BNB balances.
3. Choose an exact issuer contract and review a small spot quote.
4. Review approvals and successful simulation, then sign the small purchase.
5. Verify the confirmed token balance and place its visual building.
6. Sell the actual token amount and inspect the BscScan receipt and returned USDT.
7. Verify that a forbidden route or provider outage produces a clear unavailable/error state instead of a simulated holding.
