import { and, asc, desc, eq, gte, inArray, like, lte, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getCategory } from "./categories";
import { getPerson } from "./content";
import { marketActivity } from "./fake-market-stats";

const { markets, trades, priceHistory, users, comments } = schema;

export type MarketRow = typeof markets.$inferSelect;

export interface PersonPhoto {
  id: string;
  name: string;
  role?: string;
  image: string;
}

export interface MarketView extends Omit<MarketRow, "tags" | "people" | "sources"> {
  tags: string[];
  people: string[];
  sources: { title: string; url: string }[];
  image: string;
  personName?: string;
  /** every person on the market that has a photo, in order */
  photos: PersonPhoto[];
  categoryLabel: string;
  isTradable: boolean;
  /**
   * The trades and volume the *public* surfaces advertise — cards, the market page,
   * the rapid deck, the public JSON feed. Fabricated (see `fake-market-stats.ts`) and
   * display-only: `tradeCount` and `volume` above stay the recorded numbers, and
   * everything that has to be right — the market maker, the admin dashboard,
   * `getMarketStats`, resolution, the analysis bundle — keeps reading those.
   */
  displayTradeCount: number;
  displayVolume: number;
}

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function resolveImage(m: Pick<MarketRow, "imageUrl" | "people" | "category">): {
  image: string;
  personName?: string;
} {
  if (m.imageUrl) return { image: m.imageUrl };
  const people = parseJson<string[]>(m.people, []);
  for (const id of people) {
    const p = getPerson(id);
    if (p?.image) return { image: p.image, personName: p.name };
  }
  return { image: getCategory(m.category).cover };
}

export function toView(m: MarketRow, now = Date.now()): MarketView {
  const { image, personName } = resolveImage(m);
  const peopleIds = parseJson<string[]>(m.people, []);
  const photos: PersonPhoto[] = [];
  for (const id of peopleIds) {
    const p = getPerson(id);
    if (p?.image) photos.push({ id: p.id, name: p.name, role: p.role, image: p.image });
  }
  const activity = marketActivity(m, now);
  return {
    ...m,
    tags: parseJson<string[]>(m.tags, []),
    people: peopleIds,
    sources: parseJson<{ title: string; url: string }[]>(m.sources, []),
    image,
    personName,
    photos,
    categoryLabel: getCategory(m.category).label,
    isTradable: m.status === "open" && m.closesAt.getTime() > now,
    displayTradeCount: activity.tradeCount,
    displayVolume: activity.volume,
  };
}

/**
 * Every column of `market` except the two long-form editorial texts.
 *
 * `description` runs to four thousand characters and `resolutionCriteria` to a few
 * hundred, and between them they are the whole weight of a board query: three hundred
 * and fifty rows of prose that a card never prints. Only the market page, the JSON-LD
 * it emits and the question generator's dedupe step read either one, so a listing asks
 * for this projection and everything else keeps the full row (`columns: "full"`, which
 * stays the default so no caller changes behaviour by accident).
 *
 * `q` still searches the description — that is a WHERE clause on the server and does
 * not need the text to travel back with the row.
 */
export const MARKET_CARD_COLUMNS = {
  id: markets.id,
  title: markets.title,
  subtitle: markets.subtitle,
  category: markets.category,
  tags: markets.tags,
  imageUrl: markets.imageUrl,
  people: markets.people,
  sources: markets.sources,
  featured: markets.featured,
  appeal: markets.appeal,
  topicality: markets.topicality,
  status: markets.status,
  resolution: markets.resolution,
  resolutionNote: markets.resolutionNote,
  resolvedAt: markets.resolvedAt,
  closesAt: markets.closesAt,
  liquidity: markets.liquidity,
  qYes: markets.qYes,
  qNo: markets.qNo,
  probability: markets.probability,
  volume: markets.volume,
  tradeCount: markets.tradeCount,
  createdBy: markets.createdBy,
  createdAt: markets.createdAt,
  updatedAt: markets.updatedAt,
} as const;

export type MarketCardRow = Omit<MarketRow, "description" | "resolutionCriteria">;

/**
 * A `MarketView` built from the card projection: the two texts that were not read are
 * empty strings rather than missing, so a card view is still a `MarketView` and every
 * component keeps one type. Nothing that renders a card reads them — audited caller by
 * caller, and `scripts/test-board-cache.ts` fails if a card surface starts to.
 */
export function toCardView(r: MarketCardRow, now = Date.now()): MarketView {
  return toView({ ...r, description: "", resolutionCriteria: "" }, now);
}

export type MarketSort = "trending" | "newest" | "closing" | "volume";

export async function listMarkets(opts: {
  category?: string;
  q?: string;
  status?: "open" | "resolved" | "all";
  sort?: MarketSort;
  limit?: number;
  /** only markets that close within this many hours from now */
  closingWithinHours?: number;
  /** only markets tagged with this person id (see data/people.json) */
  person?: string;
  /** "card" drops `description` and `resolutionCriteria` from the read — see MARKET_CARD_COLUMNS */
  columns?: "card" | "full";
} = {}): Promise<MarketView[]> {
  const db = await getDb();
  const conds = [];
  if (opts.closingWithinHours) {
    conds.push(lte(markets.closesAt, new Date(Date.now() + opts.closingWithinHours * 3600_000)));
    conds.push(gte(markets.closesAt, new Date()));
  }
  if (opts.category && opts.category !== "all") conds.push(eq(markets.category, opts.category));
  // people is a JSON string[] column, so an id match is a substring match on the quoted id
  if (opts.person) conds.push(like(markets.people, `%"${opts.person}"%`));
  if (opts.status === "open") conds.push(eq(markets.status, "open"));
  else if (opts.status === "resolved") conds.push(inArray(markets.status, ["resolved", "cancelled"]));
  if (opts.q) {
    const needle = `%${opts.q.trim()}%`;
    conds.push(or(like(markets.title, needle), like(markets.description, needle), like(markets.tags, needle)));
  }
  const order =
    opts.sort === "newest"
      ? [desc(markets.createdAt)]
      : opts.sort === "closing"
        ? [asc(markets.closesAt)]
        : opts.sort === "volume"
          ? [desc(markets.volume)]
          : [desc(markets.featured), desc(markets.volume), desc(markets.createdAt)];
  const where = conds.length ? and(...conds) : undefined;
  const limit = opts.limit ?? 200;
  if (opts.columns === "card") {
    const rows = await db.select(MARKET_CARD_COLUMNS).from(markets).where(where).orderBy(...order).limit(limit);
    const now = Date.now();
    return rows.map((r) => toCardView(r, now));
  }
  const rows = await db.select().from(markets).where(where).orderBy(...order).limit(limit);
  return rows.map((r) => toView(r));
}

export async function getMarket(slug: string): Promise<MarketView | null> {
  const db = await getDb();
  const row = await db.query.markets.findFirst({ where: eq(markets.id, slug) });
  return row ? toView(row) : null;
}

/**
 * How far back a card's curve reads the house market maker's own ticks.
 *
 * `price_history` grows by roughly sixteen thousand drift rows a day and the chart
 * never draws more than thirty (`SYNTHETIC_HISTORY_WINDOW_DAYS`), so a day of slack
 * is all the deck needs. This bounds `getPriceHistoryMany` only; `getPriceHistory` is
 * the raw-truth accessor behind a documented public field (`history` in
 * `/api/markets/<slug>`) and stays unwindowed — it reads one market through
 * `price_history_market_idx`, which is a backwards index scan and not a table sort.
 */
const CHART_WINDOW_DAYS = 31;

/**
 * A market's recorded prices, oldest first.
 *
 * The row guard takes the NEWEST rows and turns them back around, never the
 * oldest: a market that has been on the board for months carries a price row for
 * every trade and every drift tick (`src/lib/drift.ts`), and a series that
 * silently stopped before today would put a stale price at the end of the chart
 * — the one point that has to be the current one.
 */
export async function getPriceHistory(slug: string, since?: Date) {
  const db = await getDb();
  const conds = [eq(priceHistory.marketId, slug)];
  if (since) conds.push(gte(priceHistory.ts, since));
  const rows = await db
    .select({ probability: priceHistory.probability, ts: priceHistory.ts })
    .from(priceHistory)
    .where(and(...conds))
    .orderBy(desc(priceHistory.ts), desc(priceHistory.id))
    .limit(5000);
  return rows.reverse().map((r) => ({ p: r.probability, t: r.ts.getTime() }));
}

/**
 * The same rows as `getPriceHistory`, for a whole list of markets, in one round trip.
 * The rapid feed draws a curve on every card it ships, and sixty separate queries per
 * page view is latency the deck cannot afford.
 *
 * The guard is per market — the newest `PER_MARKET_ROWS` rows of each — rather than a
 * flat cap on the result. A flat cap read in market order would hand the whole budget
 * to the first few markets and leave the rest of the deck with no curve at all, which
 * is exactly what happens once every market carries months of drift ticks.
 *
 * The second guard is the clock, and it applies to DRIFT ROWS ONLY (see
 * `CHART_WINDOW_DAYS`). Everything a person did — the opening price, every trade, every
 * settlement — is read however old it is, so the series a card draws still starts where
 * the market really opened and never has an estimate laid over a recorded price.
 */
export async function getPriceHistoryMany(ids: string[]): Promise<Map<string, { t: number; p: number }[]>> {
  const out = new Map<string, { t: number; p: number }[]>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  for (const id of unique) out.set(id, []);

  const db = await getDb();
  // enough for the densest card curve; the deck downsamples to 32 points anyway
  const PER_MARKET_ROWS = 400;
  // SQLite binds one parameter per id and caps the statement at 999 of them
  const CHUNK = 300;
  const since = new Date(Date.now() - CHART_WINDOW_DAYS * 86_400_000);
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const ranked = db
      .select({
        marketId: priceHistory.marketId,
        probability: priceHistory.probability,
        ts: priceHistory.ts,
        rank: sql<number>`row_number() over (partition by ${priceHistory.marketId} order by ${priceHistory.ts} desc, ${priceHistory.id} desc)`.as("rank"),
      })
      .from(priceHistory)
      // The window function has to sort everything it is handed, so the old drift tail
      // was being sorted on every deck render for a curve nobody draws. Dropping it
      // before the numbering is what keeps the sort proportional to the deck rather
      // than to how long the board has been running.
      .where(and(inArray(priceHistory.marketId, slice), or(gte(priceHistory.ts, since), ne(priceHistory.source, "drift"))))
      .as("ranked");
    const rows = await db
      .select({ marketId: ranked.marketId, probability: ranked.probability, ts: ranked.ts })
      .from(ranked)
      .where(lte(ranked.rank, PER_MARKET_ROWS))
      .orderBy(asc(ranked.marketId), asc(ranked.ts));
    for (const r of rows) out.get(r.marketId)?.push({ p: r.probability, t: r.ts.getTime() });
  }
  return out;
}

/**
 * Recent trades WITHOUT any trader identity: the site deliberately does not expose
 * who bet on what, so no caller may join the users table here.
 */
export async function getRecentTrades(slug: string | null, limit = 30) {
  const db = await getDb();
  const rows = await db
    .select({
      id: trades.id,
      side: trades.side,
      action: trades.action,
      shares: trades.shares,
      amount: trades.amount,
      priceAfter: trades.priceAfter,
      createdAt: trades.createdAt,
      marketId: trades.marketId,
      marketTitle: markets.title,
    })
    .from(trades)
    .innerJoin(markets, eq(trades.marketId, markets.id))
    .where(slug ? eq(trades.marketId, slug) : undefined)
    .orderBy(desc(trades.createdAt))
    .limit(limit);
  return rows;
}

export async function getComments(slug: string, limit = 50) {
  const db = await getDb();
  return db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      userName: users.name,
      userImage: users.image,
      userId: users.id,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.marketId, slug))
    .orderBy(desc(comments.createdAt))
    .limit(limit);
}

/** How many open markets each category currently has, for the tab counters. */
export async function getCategoryCounts(status: "open" | "resolved" | "all" = "open", person?: string) {
  const db = await getDb();
  const conds = [];
  if (status === "open") conds.push(eq(markets.status, "open"));
  else if (status === "resolved") conds.push(inArray(markets.status, ["resolved", "cancelled"]));
  if (person) conds.push(like(markets.people, `%"${person}"%`));
  const rows = await db
    .select({ category: markets.category, n: sql<number>`count(*)` })
    .from(markets)
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(markets.category);
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    counts[r.category] = r.n;
    total += r.n;
  }
  counts.all = total;
  return counts;
}

/** How many markets each person id appears on, for the candidate strip on the home page. */
export async function getPeopleCounts(status: "open" | "resolved" | "all" = "open"): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ people: markets.people })
    .from(markets)
    .where(status === "all" ? undefined : status === "open" ? eq(markets.status, "open") : inArray(markets.status, ["resolved", "cancelled"]));
  const counts: Record<string, number> = {};
  for (const r of rows) {
    for (const id of parseJson<string[]>(r.people, [])) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Other open markets that share a category, person or tag with `market`. */
export async function getRelatedMarkets(market: MarketView, limit = 4): Promise<MarketView[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(markets)
    .where(and(eq(markets.status, "open"), ne(markets.id, market.id)))
    .orderBy(desc(markets.volume), desc(markets.createdAt))
    .limit(200);
  const scored = rows
    .map((r) => {
      const v = toView(r);
      let score = 0;
      if (v.category === market.category) score += 3;
      score += v.people.filter((p) => market.people.includes(p)).length * 4;
      score += v.tags.filter((t) => market.tags.includes(t)).length * 2;
      return { v, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.v);
}

export async function getMarketStats() {
  const db = await getDb();
  const [row] = await db
    .select({
      open: sql<number>`sum(case when ${markets.status} = 'open' then 1 else 0 end)`,
      resolved: sql<number>`sum(case when ${markets.status} = 'resolved' then 1 else 0 end)`,
      volume: sql<number>`coalesce(sum(${markets.volume}), 0)`,
      trades: sql<number>`coalesce(sum(${markets.tradeCount}), 0)`,
    })
    .from(markets);
  const [u] = await db.select({ n: sql<number>`count(*)` }).from(users);
  return { open: row?.open ?? 0, resolved: row?.resolved ?? 0, volume: row?.volume ?? 0, trades: row?.trades ?? 0, users: u?.n ?? 0 };
}

export async function getLastAgentRun() {
  const db = await getDb();
  return db.query.agentRuns.findFirst({ orderBy: [desc(schema.agentRuns.createdAt)] });
}
