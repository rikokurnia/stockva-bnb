# Vercel deployment preparation

The owner plans to publish this mainnet application later from a separate repository. This document is preparation; no public deployment or repository publication is claimed.

## Project settings

Import the separate mainnet repository into Vercel. If the repository contains just this folder's contents, use its root as the project root. If it retains the current monorepo structure, set the root directory to `projects/stockcity-bnb-mainnet`.

Use the Next.js framework preset, `npm install`, and `npm run build`. Use Node.js 22.18 or newer for the read-only verification scripts. Let Vercel manage the normal `.next` build directory; leave `STOCKCITY_NEXT_DIST_DIR` unset in deployment.

Set the variables described in [the environment example](../.env.example) in the deployment environment. At minimum:

- `NEXT_PUBLIC_PRIVY_APP_ID`
- `BINANCE_WEB3_API_KEY`
- `BINANCE_WEB3_API_SECRET`
- A stable `STOCKVA_TRADING_SESSION_SECRET`, identical across all instances and subsequent deployments. Generate it privately; do not commit it.

Privy origins must include the intended public domain. Restrict production keys to their intended environment. API keys and the recovery secret must stay server-only.

## Trading state

Quote, build, simulation, and receipt recovery use encrypted, authenticated tickets bound to the same HttpOnly browser session. Requests carry the relevant ticket so independent server instances can reconstruct the reviewed trade. Local browser records are discovery hints and are rechecked before a fill is displayed. Recovery currently lasts up to 30 days; keep transaction hashes independently.

The implementation supports the verified LiquidMesh SWAP route. RFQ signing is unavailable until its complete vendor-specific adapter is verified. Keep that restriction when deploying.

## Release checks

1. Run `npm test`, `npm run typecheck`, and `npm run build` from the submitted repository.
2. Run the read-only source checks with production credentials: `npm run check:market` and `npm run check:mainnet -- YOUR_WALLET_ADDRESS 0.5 1`.
3. Verify `/city` can connect the intended mainnet wallet and retrieve real balances and issuer contracts on the public domain.
4. Review a fresh small buy quote. Check expiry, exact approval, successful Transaction API simulation, expected/minimum receipt, and the wallet account before each signature.
5. Buy, wait for the actual token receipt, then sell the confirmed amount and verify USDT returned. Keep approval, purchase, and sale hashes plus actual fees.
6. Reload the application and check City Hall recovers the order through its session and ticket. Check expired quotes and unavailable routes show their errors.
7. Add the public repository, public link, live evidence, and human-written Developer Experience Report to [the hackathon checklist](hackathon-checklist.md).

Quotes and successful builds do not prove a live round trip. An API or RPC outage must show unavailable data rather than substitute a local balance or market price.
