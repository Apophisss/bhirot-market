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
      // The recorded pair, not the display one. This endpoint is quoted, not read:
      // llms.txt points models at it, and whatever it answers can come back as "the
      // board has traded X" in somebody else's article. A number that leaves the site
      // in machine-readable form has to be the number the site actually holds — the
      // same rule /admin, /api/health and the analysis bundle already follow, and the
      // reason the inflated pair (src/lib/fake-market-stats.ts) stays on the pages,
      // where it is presentation, and stops here.
      volume: m.volume,
      tradeCount: m.tradeCount,
      closesAt: m.closesAt,
      createdAt: m.createdAt,
      createdBy: m.createdBy,
      image: m.image,
      url: `/market/${m.id}`,
    })),
  });
}
