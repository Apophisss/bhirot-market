import { NextResponse } from "next/server";
import { listMarkets, type MarketSort } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";

export const dynamic = "force-dynamic";

/** Public list of markets. ?status=open|resolved|all&category=&q=&sort=trending|newest|closing|volume */
export async function GET(req: Request) {
  await ensureSynced();
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "all") as "open" | "resolved" | "all";
  const markets = await listMarkets({
    status,
    category: url.searchParams.get("category") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    sort: (url.searchParams.get("sort") ?? "trending") as MarketSort,
    limit: Number(url.searchParams.get("limit") ?? 500),
  });
  return NextResponse.json({
    ok: true,
    count: markets.length,
    markets: markets.map((m) => ({
      slug: m.id,
      title: m.title,
      subtitle: m.subtitle,
      category: m.category,
      tags: m.tags,
      people: m.people,
      status: m.status,
      resolution: m.resolution,
      probability: m.probability,
      // the public feed matches what the public pages show (src/lib/fake-market-stats.ts)
      volume: m.displayVolume,
      tradeCount: m.displayTradeCount,
      closesAt: m.closesAt,
      createdAt: m.createdAt,
      createdBy: m.createdBy,
      image: m.image,
      url: `/market/${m.id}`,
    })),
  });
}
