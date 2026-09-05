import type { Metadata } from "next";
import { getRecentTrades, listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { ActivityFeed } from "@/components/ActivityFeed";
import { buildInitialFeed, type FeedItem, type FeedMarket } from "@/lib/fake-activity";
import { SITE_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "פעילות אחרונה",
  description:
    "הזרם החי של בחירות מרקט: העסקאות האחרונות בשוקי החיזוי על בחירות 2026 — כמה נקנה, באיזה צד ובאיזה מחיר. בלי שמות.",
  alternates: { canonical: "/activity" },
  openGraph: { url: "/activity", title: `פעילות אחרונה | ${SITE_NAME}` },
};

export default async function ActivityPage() {
  await ensureSynced();
  const [trades, markets] = await Promise.all([
    getRecentTrades(null, 100),
    listMarkets({ status: "open", limit: 120 }),
  ]);

  const feedMarkets: FeedMarket[] = markets
    .filter((m) => m.isTradable)
    .map((m) => ({ id: m.id, title: m.title, probability: m.probability }));

  // real trades carry no trader identity (see getRecentTrades) — the feed is public but anonymous
  const real: FeedItem[] = trades.map((t) => ({
    key: `t:${t.id}`,
    side: t.side,
    action: t.action,
    shares: t.shares,
    amount: t.amount,
    priceAfter: t.priceAfter,
    ts: t.createdAt.getTime(),
    marketId: t.marketId,
    marketTitle: t.marketTitle ?? undefined,
  }));

  const { items, startedAt } = buildInitialFeed(real, feedMarkets);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">פעילות אחרונה</h1>
        <p className="text-sm text-muted">כל העסקאות בכל השווקים, מהחדשה לישנה — בלי שמות.</p>
      </div>
      <div className="card p-3.5 sm:p-4">
        <ActivityFeed initial={items} markets={feedMarkets} startedAt={startedAt} />
      </div>
    </div>
  );
}
