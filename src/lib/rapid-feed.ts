import { and, asc, desc, eq, gt, notExists, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getCategory } from "./categories";
import { isTeamAuthored } from "./config";
import { toView, type MarketView } from "./markets";
import { getChartHistories } from "./display-history";
import { getRecommendations } from "./recommendations";
import { buildRapidSpark, type RapidCard, type RapidSort } from "./rapid";
import type { DisplayHistory } from "./synthetic-history";

const { markets, positions } = schema;

/** how many rows to score before slicing down to the requested feed length */
const POOL_FACTOR = 4;
const POOL_CAP = 400;
/** the recommendation engine never returns more than this in one call */
const REC_CAP = 60;
/** a question the market treats as settled is not worth a binding answer, so it goes last */
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
  const now = Date.now();
  const limit = opts.limit ?? 60;
  const sort = opts.sort ?? "mix";

  // the default deck *is* the recommendation list, one card at a time
  if (sort === "mix") return recommendedFeed(opts, limit, now);

  const db = await getDb();
  const conds = [eq(markets.status, "open"), gt(markets.closesAt, new Date(now))];
  if (opts.category && opts.category !== "all") conds.push(eq(markets.category, opts.category));
  if (opts.userId && !opts.includeAnswered) conds.push(unanswered(db, opts.userId));

  const rows = await db
    .select()
    .from(markets)
    .where(and(...conds))
    .orderBy(...sqlOrder(sort))
    .limit(Math.min(limit * POOL_FACTOR, POOL_CAP));

  return orderFeed(rows.map((r) => toView(r, now)), sort).slice(0, limit);
}

/**
 * The recommended deck. `getRecommendations` already blends what the user actually
 * trades with what the board is doing right now, drops the questions they answered
 * and spreads the categories, so the feed asks it for a slice and only pushes the
 * questions the market treats as settled to the back.
 */
async function recommendedFeed(opts: RapidFeedOptions, limit: number, now: number): Promise<MarketView[]> {
  const { items } = await getRecommendations({
    userId: opts.userId,
    category: opts.category,
    includeAnswered: opts.includeAnswered,
    limit: Math.min(limit * 2, REC_CAP),
    now,
  });
  const views = items.map((r) => r.market);
  const inPlay = views.filter(isInPlay);
  const settled = views.filter((m) => !isInPlay(m));
  return [...inPlay, ...settled].slice(0, limit);
}

function isInPlay(m: MarketView): boolean {
  return m.probability >= CERTAIN_LOW && m.probability <= CERTAIN_HIGH;
}

/**
 * A positions row exists from the first trade onwards and is never deleted, so
 * "no row" is exactly "this user never answered this question".
 */
function unanswered(db: Awaited<ReturnType<typeof getDb>>, userId: string) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(positions)
      .where(and(eq(positions.marketId, markets.id), eq(positions.userId, userId))),
  );
}

/** The feed the deck is mounted with: the questions, each with the curve behind it. */
export async function listRapidCards(opts: RapidFeedOptions = {}): Promise<RapidCard[]> {
  const feed = await listRapidFeed(opts);
  // one clock for the whole deck, and one query for the whole feed's history
  const now = Date.now();
  const history = await getChartHistories(feed, now);
  return feed.map((m) => toRapidCard(m, history.get(m.id) ?? null));
}

export function toRapidCard(m: MarketView, history?: DisplayHistory | null): RapidCard {
  const cat = getCategory(m.category);
  return {
    id: m.id,
    title: m.title,
    subtitle: m.subtitle,
    categoryLabel: cat.label,
    categoryAccent: cat.accent,
    categoryAccentDark: cat.accentDark,
    image: m.image,
    fallbackImage: cat.cover,
    personName: m.personName ?? null,
    probability: m.probability,
    qYes: m.qYes,
    qNo: m.qNo,
    liquidity: m.liquidity,
    closesAt: m.closesAt.getTime(),
    // the deck is a public surface, so it carries the display pair like every card
    volume: m.displayVolume,
    tradeCount: m.displayTradeCount,
    byTeam: isTeamAuthored(m.createdBy),
    spark: history
      ? buildRapidSpark(history.points, {
          now: history.now,
          current: m.probability,
          isOpen: m.status === "open",
          band: history.synthetic ? history.maxDeviation : null,
        })
      : null,
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

/** Reorders an already-fetched pool for the explicit sorts; "mix" is ranked by the recommendation engine instead. */
export function orderFeed(list: MarketView[], sort: RapidSort): MarketView[] {
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
    default:
      return sorted;
  }
}
