"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { money, pct, shares as fmtShares, timeAgo } from "@/lib/format";
import { FAKE_TICK_MS, fakeTradesBetween, tickAt, type FeedItem, type FeedMarket } from "@/lib/fake-activity";
import { LetterAvatar } from "@/components/Avatar";

const MAX_ITEMS = 120;

/**
 * The public activity stream. Trades are shown WITHOUT a trader: the site does
 * not expose who bet on what, so nothing here carries a name or a user id — not
 * even in the props.
 *
 * New items appear every FAKE_TICK_MS and come from `fake-activity`, which is a
 * pure function of the clock: it never writes a trade, so the feed cannot move a
 * price, a volume, a portfolio or the leaderboard.
 *
 * Each row wears a letter circle so it reads as a person rather than a bullet.
 * The letter comes from the item's own key (see `letter-avatar`) — it is
 * decoration, not an initial, and it identifies nobody.
 */
export function ActivityFeed({
  initial,
  markets,
  startedAt,
}: {
  initial: FeedItem[];
  markets: FeedMarket[];
  /** the server's clock at render time, so the first paint matches on both sides */
  startedAt: number;
}) {
  const [items, setItems] = useState(initial);
  const [now, setNow] = useState(startedAt);
  const lastTick = useRef(tickAt(startedAt));

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      const fresh = fakeTradesBetween(lastTick.current * FAKE_TICK_MS, t, markets);
      lastTick.current = tickAt(t);
      setNow(t);
      if (fresh.length) setItems((prev) => [...fresh, ...prev].slice(0, MAX_ITEMS));
    }, FAKE_TICK_MS);
    return () => clearInterval(id);
  }, [markets]);

  if (!items.length) return <p className="text-sm text-muted-2">עדיין אין עסקאות</p>;

  return (
    <ul className="divide-y divide-border">
      {items.map((t) => {
        const sideLabel = t.side === "YES" ? "כן" : "לא";
        const verb = t.action === "BUY" ? "נקנו" : "נמכרו";
        return (
          <li key={t.key} className="flex items-start gap-2.5 py-3 sm:items-center sm:gap-3">
            <span className="relative shrink-0">
              <LetterAvatar letters={t.letter} seed={t.key} size={34} />
              <span
                aria-hidden
                className={`absolute bottom-0 start-0 h-2.5 w-2.5 rounded-full border-2 border-surface ${
                  t.side === "YES" ? "bg-yes" : "bg-no"
                }`}
              />
            </span>
            <div className="min-w-0 flex-1 text-[13px] sm:text-sm">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-muted">{verb}</span>
                <span className={`font-bold ${t.side === "YES" ? "text-yes" : "text-no"}`}>
                  {fmtShares(t.shares)} {sideLabel}
                </span>
                <span className="text-muted">ב־</span>
                <span className="tabular font-semibold text-text">{money(t.amount, { decimals: true })}</span>
                <span className="text-muted-2">({pct(t.priceAfter, 1)} אחרי)</span>
              </div>
              {t.marketTitle && (
                <Link href={`/market/${t.marketId}`} className="line-clamp-1 text-xs text-accent-2 hover:underline">
                  {t.marketTitle}
                </Link>
              )}
            </div>
            <span className="shrink-0 pt-0.5 text-[11px] text-muted-2 sm:pt-0 sm:text-xs">{timeAgo(t.ts, now)}</span>
          </li>
        );
      })}
    </ul>
  );
}
