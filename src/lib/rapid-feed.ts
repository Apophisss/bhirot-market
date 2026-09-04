import { and, asc, desc, eq, gt, notExists, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getCategory } from "./categories";
import { toView, type MarketView } from "./markets";
import type { RapidCard, RapidSort } from "./rapid";

const { markets, positions } = schema;

/** how many rows to score before slicing down to the requested feed length */
const POOL_FACTOR = 4;
const POOL_CAP = 400;
/** in "mix", a question the market treats as settled is not worth a binding answer */
const CERTAIN_LOW = 0.03;
const CERTAIN_HIGH = 0.97;

export interface RapidFeedOptions {
  /** when set, markets this user has ever traded are dropped from the feed */
  userId?: string | null;
  category?: string;
  sort?: RapidSort;
  /** keep markets the user already answered */
  includeAnswered?: boolean;
  limit?: number;
}

/** Open, still-tradable markets for the rapid feed — by default only ones the user has not answered yet. */
export async function listRapidFeed(opts: RapidFeedOptions = {}): Promise<MarketView[]> {
  const db = await getDb();
  const now = new Date();
  const limit = opts.limit ?? 60;
  const sort = opts.sort ?? "mix";

  const conds = [eq(markets.status, "open"), gt(markets.closesAt, now)];
  if (opts.category && opts.category !== "all") conds.push(eq(markets.category, opts.category));
  if (opts.userId && !opts.includeAnswered) {
    // a positions row exists from the first trade onwards and is never deleted,
    // so "no row" is exactly "this user never answered this question"
    conds.push(
      notExists(
        db
          .select({ one: sql`1` })
          .from(positions)
          .where(and(eq(positions.marketId, markets.id), eq(positions.userId, opts.userId))),
      ),
    );
  }

  const rows = await db
    .select()
    .from(markets)
    .where(and(...conds))
    .orderBy(...sqlOrder(sort))
    .limit(Math.min(limit * POOL_FACTOR, POOL_CAP));

  return orderFeed(rows.map((r) => toView(r, now.getTime())), sort, now.getTime()).slice(0, limit);
}

export function toRapidCard(m: MarketView): RapidCard {
  const cat = getCategory(m.category);
  return {
    id: m.id,
    title: m.title,
    subtitle: m.subtitle,
    categoryLabel: cat.label,
    categoryEmoji: cat.emoji,
    categoryAccent: cat.accent,
    image: m.image,
    fallbackImage: cat.cover,
    personName: m.personName ?? null,
    probability: m.probability,
    qYes: m.qYes,
    qNo: m.qNo,
    liquidity: m.liquidity,
    closesAt: m.closesAt.getTime(),
    volume: m.volume,
    tradeCount: m.tradeCount,
    byClaude: m.createdBy.startsWith("claude"),
  };
}

/** The SQL slice has to already contain the right rows — the JS pass only reorders what it gets. */
function sqlOrder(sort: RapidSort) {
  switch (sort) {
    case "closing":
      return [asc(markets.closesAt)];
    case "new":
      return [desc(markets.createdAt)];
    case "hot":
      return [desc(markets.volume), desc(markets.tradeCount)];
    default:
      return [desc(markets.featured), asc(markets.closesAt)];
  }
}

/**
 * How "worth asking right now" a question is: a coin-flip question that closes soon,
 * is fresh and already has trading on it makes a better rapid card than one that
 * closes in four months.
 */
function rapidScore(m: MarketView, now: number): number {
  const days = Math.max(0.5, (m.closesAt.getTime() - now) / 86_400_000);
  const urgency = 1 / Math.sqrt(days);
  const heat = Math.log10(1 + m.volume) / 5;
  const fresh = Math.max(0, 1 - (now - m.createdAt.getTime()) / (14 * 86_400_000)) * 0.4;
  const uncertainty = 1 - Math.abs(m.probability - 0.5) * 2;
  return urgency + heat + fresh + uncertainty * 0.6 + (m.featured ? 0.5 : 0);
}

/** Round-robin over categories so two questions about the same thing never sit back to back. */
function interleaveByCategory(list: MarketView[]): MarketView[] {
  const buckets = new Map<string, MarketView[]>();
  for (const m of list) {
    const b = buckets.get(m.category);
    if (b) b.push(m);
    else buckets.set(m.category, [m]);
  }
  const queues = [...buckets.values()];
  const out: MarketView[] = [];
  while (out.length < list.length) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

export function orderFeed(list: MarketView[], sort: RapidSort, now = Date.now()): MarketView[] {
  const sorted = [...list];
  switch (sort) {
    case "closing":
      sorted.sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime());
      return sorted;
    case "new":
      sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return sorted;
    case "hot":
      sorted.sort((a, b) => b.volume - a.volume || b.tradeCount - a.tradeCount);
      return sorted;
    default: {
      const inPlay = sorted.filter((m) => m.probability >= CERTAIN_LOW && m.probability <= CERTAIN_HIGH);
      const base = inPlay.length ? inPlay : sorted;
      base.sort((a, b) => rapidScore(b, now) - rapidScore(a, now));
      return interleaveByCategory(base);
    }
  }
}
