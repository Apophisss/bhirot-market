/**
 * Fabricated activity for the /activity feed.
 *
 * These trades are DISPLAY ONLY. Nothing here writes to the database, moves a
 * price, adds to a market's volume, touches a portfolio or feeds the leaderboard:
 * every item is derived from the clock by a pure function, so the site's real
 * numbers cannot be contaminated by it even in principle.
 *
 * Determinism is on an absolute time axis — the item for a given 5-second tick is
 * a function of that tick alone — so the feed reads the same on every device and
 * on a reload, and the server-rendered backfill matches what the client keeps
 * appending afterwards.
 */
import { letterForHash } from "./letter-avatar";

/** one fabricated trade per tick */
export const FAKE_TICK_MS = 5_000;

/** how far back the server pre-fills the feed, so the page is never near-empty */
export const FAKE_BACKFILL_MS = 8 * 60_000;

export interface FeedMarket {
  id: string;
  title: string;
  /** current YES probability, used so the fabricated prices sit near the real one */
  probability: number;
}

export interface FeedItem {
  /** stable react key; "f:" fabricated, "t:" a real trade */
  key: string;
  side: "YES" | "NO";
  action: "BUY" | "SELL";
  shares: number;
  amount: number;
  priceAfter: number;
  /** epoch ms */
  ts: number;
  marketId: string;
  marketTitle?: string;
  /**
   * The capital shown in the row's avatar circle. Decorative: it is drawn from
   * the item's own key, never from a trader — a real trade stays anonymous.
   */
  letter: string;
}

function hash32(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** hash → [0, 1) */
function unit(h: number): number {
  return h / 0x1_0000_0000;
}

export function tickAt(ms: number): number {
  return Math.floor(ms / FAKE_TICK_MS);
}

/**
 * The fabricated trade for one tick, or null when there is nothing tradable to
 * attach it to. Amounts stay in the range a real player bets (₪5–₪250) and the
 * price stays within a point of the market's real probability, so a visitor who
 * clicks through from the feed does not meet a contradiction.
 */
export function fakeTradeAt(tick: number, markets: FeedMarket[]): FeedItem | null {
  if (!markets.length) return null;
  const m = markets[hash32(tick, 0x01) % markets.length];
  const p = Math.min(0.99, Math.max(0.01, m.probability));
  // buying the likelier side more often is what a real order flow looks like
  const side: "YES" | "NO" = unit(hash32(tick, 0x02)) < 0.35 + 0.3 * p ? "YES" : "NO";
  const action: "BUY" | "SELL" = unit(hash32(tick, 0x03)) < 0.85 ? "BUY" : "SELL";
  const amount = 5 + Math.round(unit(hash32(tick, 0x04)) ** 2 * 245);
  const price = side === "YES" ? p : 1 - p;
  const jitter = (unit(hash32(tick, 0x05)) - 0.5) * 0.01;
  return {
    key: `f:${tick}`,
    side,
    action,
    shares: amount / Math.max(0.02, price),
    amount,
    priceAfter: Math.min(0.99, Math.max(0.01, p + jitter)),
    ts: tick * FAKE_TICK_MS,
    marketId: m.id,
    marketTitle: m.title,
    letter: letterForHash(hash32(tick, 0x06)),
  };
}

/**
 * Every fabricated trade in (fromMs, toMs], newest first. Used both for the
 * server-rendered backfill and for the ticks the open page appends as time passes.
 */
export function fakeTradesBetween(fromMs: number, toMs: number, markets: FeedMarket[]): FeedItem[] {
  const first = tickAt(fromMs) + 1;
  const last = tickAt(toMs);
  const out: FeedItem[] = [];
  for (let t = last; t >= first; t--) {
    const item = fakeTradeAt(t, markets);
    if (item) out.push(item);
  }
  return out;
}

/**
 * The feed as the server first paints it: the fabricated backfill merged with the
 * real (already anonymous) trades, newest first. It reads the clock itself so the
 * page component stays a pure render.
 */
export function buildInitialFeed(
  real: FeedItem[],
  markets: FeedMarket[],
  limit = 120,
): { items: FeedItem[]; startedAt: number } {
  const startedAt = Date.now();
  const items = [...fakeTradesBetween(startedAt - FAKE_BACKFILL_MS, startedAt, markets), ...real]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
  return { items, startedAt };
}
