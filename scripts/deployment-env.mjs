const required = [
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "BINANCE_WEB3_API_KEY",
  "BINANCE_WEB3_API_SECRET",
  "STOCKVA_TRADING_SESSION_SECRET",
];

/** Return names/reasons only; never echo credentials into a build log. */
export function deploymentEnvErrors(env) {
  const errors = [];
  for (const name of required) {
    const value = env[name]?.trim();
    if (!value || /^(?:REPLACE_|YOUR_|<)/i.test(value))
      errors.push(`${name}: add a real value in Vercel Environment Variables.`);
  }
  const secret = env.STOCKVA_TRADING_SESSION_SECRET?.trim();
  if (secret && secret.length < 32)
    errors.push(
      "STOCKVA_TRADING_SESSION_SECRET: use at least 32 characters; generate a random secret once and retain it.",
    );
  for (const name of ["BSC_MAINNET_RPC_URL", "NEXT_PUBLIC_BSC_RPC_URL"]) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error();
    } catch {
      errors.push(
        `${name}: use an HTTPS BSC mainnet RPC URL without embedded username/password.`,
      );
    }
  }
  if (env.STOCKCITY_NEXT_DIST_DIR && env.STOCKCITY_NEXT_DIST_DIR !== ".next")
    errors.push(
      "STOCKCITY_NEXT_DIST_DIR: remove this local build override from Vercel.",
    );
  return errors;
}
