# Deploy stockva-bnb on Vercel

The deployable repository is [rikokurnia/stockva-bnb](https://github.com/rikokurnia/stockva-bnb). Its repository root contains this Next.js app. Public deployment and the funded mainnet buy/sell test remain pending.

## Project settings

Import `rikokurnia/stockva-bnb` into Vercel and select:

| Setting           | Value                                         |
| ----------------- | --------------------------------------------- |
| Framework         | Next.js                                       |
| Root Directory    | Repository root (`./`); leave the field empty |
| Production Branch | `main`                                        |
| Node.js           | `22.x` (pinned in `package.json`)             |
| Install Command   | `npm ci`                                      |
| Build Command     | `npm run build:vercel`                        |
| Output Directory  | Framework default (`.next`); no override      |

`vercel.json` supplies the framework, install/build commands, Fluid compute, and a 120-second API-function budget for cold provider/RPC calls. The existing advisor route also declares a 60-second budget. Do not configure this as a static export: the app needs its server API routes. Do not set `STOCKCITY_NEXT_DIST_DIR` on Vercel.

These settings follow the official [project configuration](https://vercel.com/docs/project-configuration/vercel-json), [Node.js version](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), and [function duration](https://vercel.com/docs/functions/configuring-functions/duration) documentation. The repository config and local build are verifiable here; Vercel account provisioning is checked after deployment.

## Environment template

Use [`.env.vercel.example`](../.env.vercel.example) as the copy/paste template. Replace the `REPLACE_*` values with your own credentials and import them through Vercel **Settings → Environment Variables**. Select **Production**. Configure **Preview** separately if you want working preview deployments; the same preflight runs there. The first import screen also lets you add variables before deploying.

| Variable                         | What to enter                                                                                   | Visibility                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| `NEXT_PUBLIC_PRIVY_APP_ID`       | App ID from your Privy app's dashboard; use the same app as the local wallet login if desired   | Public, baked into the browser build |
| `BINANCE_WEB3_API_KEY`           | Your existing Binance Web3 API key                                                              | Server-only; mark Sensitive          |
| `BINANCE_WEB3_API_SECRET`        | Matching Binance Web3 API secret                                                                | Server-only; mark Sensitive          |
| `STOCKVA_TRADING_SESSION_SECRET` | One randomly generated 64-character hex secret, retained across redeploys and instances         | Server-only; mark Sensitive          |
| `BSC_MAINNET_RPC_URL`            | Optional HTTPS BSC mainnet RPC; template contains the public default                            | Server-only                          |
| `NEXT_PUBLIC_BSC_RPC_URL`        | Optional HTTPS BSC mainnet RPC that permits browser calls; template contains the public default | Public                               |

Generate the recovery secret privately on your own machine:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save that result privately and paste it into Vercel. Do not regenerate it for routine redeploys: changing it invalidates existing recovery tickets. Use the same value across instances serving the same deployment environment.

No `PRIVY_APP_SECRET`, server `PRIVY_APP_ID`, deployer private key, custom vault address, chain-ID variable, or Vercel token belongs in this template. This app connects the user's wallet and uses existing BSC issuer/router contracts.

To enable the Cokoo advisor, add at least one optional provider key (`DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, or `MUSESPARK_API_KEY`) and its supported model from your provider account. Optional lines are commented in the template so an unused placeholder does not masquerade as an API credential. `SEC_USER_AGENT` can identify your real app/contact for SEC financial research. Charts and news do not require a separate Yahoo API key.

Public RPC URLs cannot conceal an API token in the browser. Use a browser-safe/domain-restricted endpoint if you replace the default. Never prefix private credentials with `NEXT_PUBLIC_`.

The build checks required values, common template placeholders, recovery-secret length, RPC URL syntax, and the standard output directory. It reports variable names/reasons only. It does not verify provider permissions, the deployed Privy origin, or RPC chain identity; the read-only integration checks and deployed smoke test handle those. You can run the same check locally with `npm run check:deployment` after adding values to `.env.local`.

Environment changes apply to subsequent deployments. Redeploy after adding/changing variables; `NEXT_PUBLIC_*` values are frozen into the browser at build time. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Privy origins and first deployment

1. Deploy after filling the required variables. This step publishes the site; it does not fund, approve, or trade.
2. Copy the exact HTTPS deployment origin, such as `https://stockva-bnb.vercel.app`, into the allowed origins for the Privy app matching `NEXT_PUBLIC_PRIVY_APP_ID`. Add your custom domain separately if used. Use your actual assigned domain, not this example.
3. For previews, allow the exact preview origin or a supported Privy preview-domain rule. A changing preview URL does not automatically inherit production authorization.
4. Open `/` and `/city`, connect the wallet, and confirm BNB Smart Chain mainnet (56). Verify actual wallet balances, issuer assets, and charts.
5. If your Binance Web3 key has network restrictions, verify the Vercel deployment can use it. A successful local key check does not prove hosted access; provider errors must remain visible.

The wallet UI no longer silently selects a hardcoded Privy app. Missing public configuration fails explicitly. The production browser receives only the public App ID and optional public RPC URL; Binance credentials and order-recovery keys stay on the server.

## Trading state and release checks

Quote, build, simulation, and receipt recovery use encrypted, authenticated tickets bound to the same HttpOnly browser session. Requests carry tickets so independent server instances can reconstruct reviewed trades. Browser records are rechecked against mainnet before a fill is displayed. Recovery lasts up to 30 days; retain transaction hashes independently. HTTPS proxy handling produces Secure cookies on Vercel.

The verified LiquidMesh SWAP route is implemented. RFQ signing remains unavailable until its complete vendor-specific adapter is verified. Keep that restriction when deploying.

Before publishing, run:

```bash
npm ci
npm run check:deployment
npm test
npm run typecheck
npm run build:vercel
```

After deployment, check the hosted browser's API responses and wallet connection. Fresh local provider probes can also be run with the same credentials:

```bash
npm run check:market
npm run check:mainnet -- YOUR_WALLET_ADDRESS 0.5 1
```

Those scripts do not sign or broadcast and do not by themselves validate the hosted environment. On the hosted app, review a small fresh quote and confirm that the unsigned build and approval simulation work. Then separately perform the authorized funded buy, confirm the real token receipt, sell, and reconcile returned USDT and actual gas. Reload City Hall to verify order recovery.

A completed build, quote, or approval simulation does not prove a live round trip. No hosted release or mainnet fill is claimed until its actual evidence is recorded.

## Repository verification — 11 October 2026

- A clean `npm ci` passed under Node **22.23.3**. The final patched lockfile also passed `npm ci --dry-run`.
- All **19 production test files**, typecheck, and the final `npm run build:vercel` passed under Node 22 using the normal `.next` output.
- An empty deployment environment was correctly rejected; the successful build used an ephemeral verification-only recovery secret. No real recovery secret was generated for your Vercel project or committed. Supply your own persistent value from the template.
- The checked-in Vercel settings were checked against Vercel's official current schema.
- No configured private credential values were found in browser JavaScript chunks.
- The local production browser opened Privy's wallet chooser and rendered the bStocks NVDAB chart with actual volume and averages. No wallet was connected and no transaction was signed. Assets polling showed transient HTTP 502 responses during the extended run; a fresh endpoint check returned HTTP 200. Hosted provider access still needs the post-deploy smoke test.
- PostCSS, source-map-js, Sharp, and WebSocket dependencies were patched. The final npm audit reported **0 high, 0 critical, and 24 moderate advisories**. Moderate upstream advisories remain; this is deployment verification, not a security-audit certification.
- Existing optional Farcaster/Solana and viem Tempo build warnings remain; the tested BSC routes compiled and the wallet chooser opened.

The temporary application server was stopped. The repository is prepared for import; no Vercel account project or public deployment was created during these checks.
