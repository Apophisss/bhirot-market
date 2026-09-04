import { NextResponse } from "next/server";
import { getMarket, getPriceHistory, getRecentTrades } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await ensureSynced();
  const { slug } = await ctx.params;
  const market = await getMarket(slug);
  if (!market) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const [history, recent] = await Promise.all([getPriceHistory(slug), getRecentTrades(slug, 20)]);
  return NextResponse.json({ ok: true, market, history, recentTrades: recent });
}
