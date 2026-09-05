import type { Metadata } from "next";
import { getRecentTrades, listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { ActivityFeed } from "@/components/ActivityFeed";
import { buildInitialFeed, type FeedItem, type FeedMarket } from "@/lib/fake-activity";
import { letterFor } from "@/lib/letter-avatar";
import { SITE_NAME } from "@/lib/config";
import { shareCard } from "@/lib/seo";

const DESCRIPTION =
  "הזרם החי של בחירות מרקט: התשובות האחרונות בשאלות על בחירות 2026 — כמה נקודות, באיזה צד ובאיזה מחיר. בלי שמות.";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "פעילות אחרונה",
  description: DESCRIPTION,
  alternates: { canonical: "/activity" },
  ...shareCard({ title: `פעילות אחרונה | ${SITE_NAME}`, description: DESCRIPTION, path: "/activity" }),
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
    // seeded by the trade id, not by the trader: the feed stays anonymous
    letter: letterFor(`t:${t.id}`),
  }));

  const { items, startedAt } = buildInitialFeed(real, feedMarkets);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">פעילות אחרונה</h1>
        <p className="text-sm text-muted">כל התשובות בכל השאלות, מהחדשה לישנה — בלי שמות.</p>
      </div>
      <div className="card p-3.5 sm:p-4">
        <ActivityFeed initial={items} markets={feedMarkets} startedAt={startedAt} />
      </div>
    </div>
  );
}
