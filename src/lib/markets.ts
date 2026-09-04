import { and, asc, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getCategory } from "./categories";
import { getPerson } from "./content";

const { markets, trades, priceHistory, users, comments } = schema;

export type MarketRow = typeof markets.$inferSelect;

export interface MarketView extends Omit<MarketRow, "tags" | "people" | "sources"> {
  tags: string[];
  people: string[];
  sources: { title: string; url: string }[];
  image: string;
  personName?: string;
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
  return {
    ...m,
    tags: parseJson<string[]>(m.tags, []),
    people: parseJson<string[]>(m.people, []),
    sources: parseJson<{ title: string; url: string }[]>(m.sources, []),
    image,
    personName,
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
} = {}): Promise<MarketView[]> {
  const db = await getDb();
  const conds = [];
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
