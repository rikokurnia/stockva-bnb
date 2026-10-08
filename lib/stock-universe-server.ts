import { createHash } from "node:crypto";
import {
  parseStockHoldings,
  SP100_SNAPSHOT,
  type StockUniverse,
} from "./stock-universe.ts";

let saved: { at: number; data: StockUniverse } | undefined;
let pending: Promise<StockUniverse> | undefined;
export async function getStockUniverse(): Promise<StockUniverse> {
  if (
    saved &&
    Date.now() - saved.at < (saved.data.retrievalError ? 300_000 : 86_400_000)
  )
    return saved.data;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(SP100_SNAPSHOT.sourceUrl, {
        headers: {
          "User-Agent": "Stockva stock-universe research",
          Accept: "text/csv",
        },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(`Holdings source returned HTTP ${response.status}.`);
      const csv = await response.text();
      if (csv.length > 1_000_000)
        throw new Error("Holdings response exceeds the expected size.");
      const match = csv.match(
        /Fund Holdings as of,"([A-Z][a-z]{2} \d{2}, \d{4})"/,
      );
      const date = match ? Date.parse(`${match[1]} UTC`) : NaN;
      if (!Number.isFinite(date) || date > Date.now() + 86_400_000)
        throw new Error("Holdings date unavailable or invalid.");
      const previous = saved?.data ?? SP100_SNAPSHOT;
      if (date < Date.parse(previous.asOf))
        throw new Error("Holdings source returned an older snapshot.");
      return {
        ...SP100_SNAPSHOT,
        asOf: new Date(date).toISOString().slice(0, 10),
        companies: parseStockHoldings(csv),
        sha256: createHash("sha256").update(csv).digest("hex"),
      };
    } catch {
      return {
        ...(saved?.data ?? SP100_SNAPSHOT),
        retrievalError:
          "Live roster refresh unavailable; showing the dated published holdings snapshot.",
      };
    }
  })()
    .then((data) => {
      saved = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
