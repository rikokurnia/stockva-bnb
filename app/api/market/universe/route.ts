import { getStockUniverse } from "../../../../lib/stock-universe-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await getStockUniverse(), {
    headers: { "Cache-Control": "no-store" },
  });
}
