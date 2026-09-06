import type { Metadata } from "next";
import { RapidCta } from "@/components/RapidCta";
import { getRecentTrades, listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { ActivityFeed } from "@/components/ActivityFeed";
import { buildInitialFeed, type FeedItem, type FeedMarket } from "@/lib/fake-activity";
import { letterFor } from "@/lib/letter-avatar";
import { SITE_NAME } from "@/lib/config";
import { shareCard } from "@/lib/seo";

const DESCRIPTION =
  "זרם ההדגמה של בחירות מרקט: איך נראה לוח פעיל — תשובות בשאלות על בחירות 2026, כמה נקודות, באיזה צד ובאיזה מחיר. רוב השורות הן הדגמה, ואין בהן שמות.";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "פעילות אחרונה",
  description: DESCRIPTION,
  alternates: { canonical: "/activity" },
  // Most of what this page shows is fabricated (src/lib/fake-activity.ts), so it is
  // the one page on the site that must not be in an index: a search result promising
  // "התשובות האחרונות" and delivering a demo is a claim the site cannot stand behind,
  // and a page of invented activity is not what anyone should reach the site through.
  // `follow` stays on — the questions it links to are real and worth crawling.
  robots: { index: false, follow: true },
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
      {/* The one line that makes the rest of the page honest. `buildInitialFeed` mixes
          the recorded trades with a stream fabricated from the clock and marks
          neither, so a reader has no way to tell them apart — and the site has 5 real
          weekly players, which means almost every row here is a demo. Saying so once,
          above the feed, is the minimum; the alternative is a page that quietly
          overstates how busy the board is. */}
      <p className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-text">
        <strong>זרם הדגמה.</strong> הדף מראה איך נראה לוח פעיל: רוב השורות כאן נוצרות בחישוב מקומי ואינן תשובות של שחקנים.
        הן אינן משפיעות על אף מד, על הניקוד שלכם או על לוח המובילים. התשובות שלכם — כן.
      </p>
      <div className="card p-3.5 sm:p-4">
        <ActivityFeed initial={items} markets={feedMarkets} startedAt={startedAt} />
      </div>

      {/* watching other people answer is the one page on the site with no question on
          it; the deck is one tap away and is what the feed is a stream of */}
      <RapidCta
        evt="activity-rapid"
        title="כל אלה ענו על שאלה. תורכם."
        body="מצב זריז מגיש את השאלות אחת אחרי השנייה — כן או לא, וממשיכים. התשובות שלכם ייכנסו לזרם הזה."
        label="לענות ברצף"
      />
    </div>
  );
}
