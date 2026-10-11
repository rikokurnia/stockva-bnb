import test from "node:test";
import assert from "node:assert/strict";
import { deploymentEnvErrors } from "../scripts/deployment-env.mjs";

const complete = {
  NEXT_PUBLIC_PRIVY_APP_ID: "test-public-app",
  BINANCE_WEB3_API_KEY: "test-api-key-not-a-real-key",
  BINANCE_WEB3_API_SECRET: "test-api-secret-not-a-real-secret",
  STOCKVA_TRADING_SESSION_SECRET: "a".repeat(64),
};
test("complete deployment needs no unused Privy secret or optional advisor/RPC key", () => {
  assert.deepEqual(deploymentEnvErrors(complete), []);
});
test("missing settings block deployment without leaking supplied values", () => {
  const input = {
    ...complete,
    NEXT_PUBLIC_PRIVY_APP_ID: "",
    STOCKVA_TRADING_SESSION_SECRET: "test-short-private-value",
  };
  const errors = deploymentEnvErrors(input);
  assert.ok(
    errors.some((error) => error.startsWith("NEXT_PUBLIC_PRIVY_APP_ID:")),
  );
  assert.ok(
    errors.some((error) => error.startsWith("STOCKVA_TRADING_SESSION_SECRET:")),
  );
  for (const value of Object.values(input).filter(Boolean))
    assert.ok(!errors.join("\n").includes(value));
});
test("copying template placeholders without replacing them cannot pass preflight", () => {
  const errors = deploymentEnvErrors(
    Object.fromEntries(
      Object.keys(complete).map((name) => [
        name,
        "REPLACE_WITH_YOUR_REAL_VALUE",
      ]),
    ),
  );
  assert.equal(errors.length, 5); // Four unset values plus a short recovery secret.
});
test("deployment rejects unsafe RPC protocols and custom local build directories", () => {
  for (const url of [
    "http://localhost:8545",
    "not-a-url",
    "https://private-user:private-password@rpc.example.com",
  ]) {
    const errors = deploymentEnvErrors({
      ...complete,
      BSC_MAINNET_RPC_URL: url,
    });
    assert.equal(errors.length, 1);
    assert.ok(!errors[0].includes(url));
  }
  assert.deepEqual(
    deploymentEnvErrors({
      ...complete,
      BSC_MAINNET_RPC_URL: "https://bsc-dataseed.binance.org",
      NEXT_PUBLIC_BSC_RPC_URL: "https://rpc.example.com/bsc",
      STOCKCITY_NEXT_DIST_DIR: ".next",
    }),
    [],
  );
  assert.ok(
    deploymentEnvErrors({
      ...complete,
      STOCKCITY_NEXT_DIST_DIR: ".next-production",
    }).some((error) => error.startsWith("STOCKCITY_NEXT_DIST_DIR:")),
  );
});
