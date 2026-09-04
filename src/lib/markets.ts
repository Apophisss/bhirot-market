import { and, asc, desc, eq, gte, inArray, like, lte, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getCategory } from "./categories";
import { getPerson } from "./content";

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
  };
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
} = {}): Promise<MarketView[]> {
  const db = await getDb();
  const conds = [];
  if (opts.closingWithinHours) {
    conds.push(lte(markets.closesAt, new Date(Date.now() + opts.closingWithinHours * 3600_000)));
    conds.push(gte(markets.closesAt, new Date()));
  }
  if (opts.category && opts.category !== "all") conds.push(eq(markets.category, opts.category));
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
  const rows = await db
    .select()
    .from(markets)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...order)
    .limit(opts.limit ?? 200);
  return rows.map((r) => toView(r));
}

export async function getMarket(slug: string): Promise<MarketView | null> {
  const db = await getDb();
  const row = await db.query.markets.findFirst({ where: eq(markets.id, slug) });
  return row ? toView(row) : null;
}

export async function getPriceHistory(slug: string, since?: Date) {
  const db = await getDb();
  const conds = [eq(priceHistory.marketId, slug)];
  if (since) conds.push(gte(priceHistory.ts, since));
  const rows = await db
    .select({ probability: priceHistory.probability, ts: priceHistory.ts })
    .from(priceHistory)
    .where(and(...conds))
    .orderBy(asc(priceHistory.ts))
    .limit(5000);
  return rows.map((r) => ({ p: r.probability, t: r.ts.getTime() }));
}

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
      userName: users.name,
      userImage: users.image,
      userId: users.id,
    })
    .from(trades)
    .innerJoin(users, eq(trades.userId, users.id))
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
export async function getCategoryCounts(status: "open" | "resolved" | "all" = "open") {
  const db = await getDb();
  const rows = await db
    .select({ category: markets.category, n: sql<number>`count(*)` })
    .from(markets)
    .where(status === "all" ? undefined : status === "open" ? eq(markets.status, "open") : inArray(markets.status, ["resolved", "cancelled"]))
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
