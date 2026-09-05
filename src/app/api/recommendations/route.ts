import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureSynced } from "@/lib/sync";
import { getRecommendations, topCategories } from "@/lib/recommendations";

export const dynamic = "force-dynamic";

/**
 * Recommendations for the signed-in user (or plain popularity for a guest).
 * ?limit=&category=&all=1 — `all=1` keeps questions the user already answered.
 *
 * Private by definition: the answer depends on the caller's session, so it must
 * never be cached by a CDN or a shared browser cache.
 */
export async function GET(req: Request) {
  await ensureSynced();
  const url = new URL(req.url);
  const session = await auth();
  const { items, profile, personalized } = await getRecommendations({
    userId: session?.user?.id,
    limit: Number(url.searchParams.get("limit") ?? 12),
    category: url.searchParams.get("category") ?? undefined,
    includeAnswered: url.searchParams.get("all") === "1",
  });
  return NextResponse.json(
    {
      ok: true,
      personalized,
      profile: { markets: profile.markets, strength: Number(profile.strength.toFixed(3)), interests: topCategories(profile) },
      count: items.length,
      markets: items.map((r) => ({
        slug: r.market.id,
        title: r.market.title,
        category: r.market.category,
        probability: r.market.probability,
        closesAt: r.market.closesAt,
        volume: r.market.volume,
        tradeCount: r.market.tradeCount,
        image: r.market.image,
        score: Number(r.score.toFixed(4)),
        taste: Number(r.taste.toFixed(4)),
        popularity: Number(r.popularity.toFixed(4)),
        reasons: r.reasons,
        url: `/market/${r.market.id}`,
      })),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
