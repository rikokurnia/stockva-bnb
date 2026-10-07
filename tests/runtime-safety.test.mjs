import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function sources(entry) {
  const pending = [resolve(root, entry)],
    seen = new Map();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    const text = readFileSync(file, "utf8");
    seen.set(file, text);
    for (const match of text.matchAll(
      /(?:from\s*|import\s*\()(["'])(\.[^"']+)\1/g,
    )) {
      const base = resolve(dirname(file), match[2]);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(
        (x) => existsSync(x) && /\.(ts|tsx)$/.test(x),
      );
      if (target) pending.push(target);
    }
  }
  return seen;
}
test("city runtime cannot reach a testnet contract or fabricated execution", () => {
  const active = sources("components/stock-city.tsx");
  for (const [path, source] of active) {
    assert.ok(
      !path.endsWith("/lib/contracts.ts"),
      `testnet contract import: ${path}`,
    );
    assert.ok(
      !/bscTestnet|claimFaucetOnchain|recordBuildingOnchain|sellBuildingOnchain|prepareRebalanceBatch/.test(
        source,
      ),
      `retired write reachable: ${path}`,
    );
  }
});
test("server API secrets never enter the browser dependency graph", () => {
  for (const [path, source] of sources("components/stock-city.tsx")) {
    assert.ok(
      !/BINANCE_WEB3_API_SECRET|PRIVY_APP_SECRET|GEMINI_API_KEY|createHmac/.test(
        source,
      ),
      `server secret dependency: ${path}`,
    );
  }
});
test("the old simulation rebalance API refuses execution", () => {
  const text = readFileSync(
    resolve(root, "app/api/rebalance/route.ts"),
    "utf8",
  );
  assert.match(text, /status: 410/);
  assert.doesNotMatch(text, /readContract|bscTestnet|VAULT_ADDRESS/);
});
