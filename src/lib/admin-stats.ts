import { and, count, desc, eq, gte, lt, sql, sum } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getCategory } from "./categories";
import { getInboxCounts, type InboxCounts } from "./inbox";

const { markets, trades, users, positions, comments, agentRuns, priceHistory } = schema;

export interface DayPoint {
  /** yyyy-mm-dd in Israel time */
  day: string;
  trades: number;
  volume: number;
  newUsers: number;
}

export interface CategoryStat {
  id: string;
  label: string;
  open: number;
  resolved: number;
  volume: number;
  trades: number;
}

export interface AdminStats {
  generatedAt: number;
  users: { total: number; new24h: number; new7d: number; traders: number; active7d: number; balance: number };
  markets: {
    total: number;
    open: number;
    resolved: number;
    cancelled: number;
    featured: number;
    closing24h: number;
    closing7d: number;
    /** open markets whose closesAt is already in the past — the resolution debt */
    overdue: number;
    added7d: number;
    byCreator: { source: string; n: number }[];
  };
  trading: {
    volume: number;
    trades: number;
    trades24h: number;
    volume24h: number;
    trades7d: number;
    volume7d: number;
    avgTrade: number;
    openPositions: number;
    positionsValue: number;
    yesShare: number;
  };
  engagement: { comments: number; comments7d: number; pricePoints: number };
  inbox: InboxCounts;
  categories: CategoryStat[];
  topMarkets: { id: string; title: string; volume: number; tradeCount: number; probability: number; status: string }[];
  overdueMarkets: { id: string; title: string; closesAt: Date }[];
  closingSoon: { id: string; title: string; closesAt: Date; probability: number }[];
  recentRuns: (typeof agentRuns.$inferSelect)[];
  daily: DayPoint[];
}

const ISRAEL_TZ = "Asia/Jerusalem";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ISRAEL_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

function dayKey(d: Date | number): string {
  return dayFmt.format(new Date(d));
}

/** Everything the dashboard shows, in one round of queries. */
export async function getAdminStats(days = 14): Promise<AdminStats> {
  const db = await getDb();
  const now = Date.now();
  const d1 = new Date(now - 86_400_000);
  const d7 = new Date(now - 7 * 86_400_000);
  const windowStart = new Date(now - days * 86_400_000);
  const nowDate = new Date(now);

  const [
    userTotals,
    newUsers24h,
    newUsers7d,
    traderRows,
    marketStatusRows,
    marketFlags,
    creatorRows,
    tradeTotals,
    trade24h,
    trade7d,
    yesRows,
    positionRows,
    commentTotals,
    comments7d,
    pricePoints,
    categoryRows,
    topMarkets,
    overdueMarkets,
    closingSoon,
    recentRuns,
    recentTrades,
    recentUsers,
    inbox,
  ] = await Promise.all([
    db.select({ n: count(), balance: sum(users.balance).mapWith(Number) }).from(users),
    db.select({ n: count() }).from(users).where(gte(users.createdAt, d1)),
    db.select({ n: count() }).from(users).where(gte(users.createdAt, d7)),
    db.select({ all: sql<number>`count(distinct ${trades.userId})` }).from(trades),
    db.select({ status: markets.status, n: count() }).from(markets).groupBy(markets.status),
    db
      .select({
        featured: sql<number>`sum(case when ${markets.featured} = 1 then 1 else 0 end)`,
        closing24h: sql<number>`sum(case when ${markets.status} = 'open' and ${markets.closesAt} between ${now} and ${now + 86_400_000} then 1 else 0 end)`,
        closing7d: sql<number>`sum(case when ${markets.status} = 'open' and ${markets.closesAt} between ${now} and ${now + 7 * 86_400_000} then 1 else 0 end)`,
        overdue: sql<number>`sum(case when ${markets.status} = 'open' and ${markets.closesAt} < ${now} then 1 else 0 end)`,
        added7d: sql<number>`sum(case when ${markets.createdAt} >= ${now - 7 * 86_400_000} then 1 else 0 end)`,
      })
      .from(markets),
    db.select({ source: markets.createdBy, n: count() }).from(markets).groupBy(markets.createdBy).orderBy(desc(count())),
    db.select({ n: count(), volume: sum(trades.amount).mapWith(Number) }).from(trades),
    db.select({ n: count(), volume: sum(trades.amount).mapWith(Number) }).from(trades).where(gte(trades.createdAt, d1)),
    db.select({ n: count(), volume: sum(trades.amount).mapWith(Number) }).from(trades).where(gte(trades.createdAt, d7)),
    db.select({ n: count() }).from(trades).where(eq(trades.side, "YES")),
    db
      .select({
        n: count(),
        value: sql<number>`coalesce(sum(${positions.yesShares} * ${markets.probability} + ${positions.noShares} * (1 - ${markets.probability})), 0)`,
      })
      .from(positions)
      .innerJoin(markets, eq(positions.marketId, markets.id))
      .where(and(eq(positions.settled, false), eq(markets.status, "open"))),
    db.select({ n: count() }).from(comments),
    db.select({ n: count() }).from(comments).where(gte(comments.createdAt, d7)),
    db.select({ n: count() }).from(priceHistory),
    db
      .select({
        category: markets.category,
        open: sql<number>`sum(case when ${markets.status} = 'open' then 1 else 0 end)`,
        resolved: sql<number>`sum(case when ${markets.status} != 'open' then 1 else 0 end)`,
        volume: sql<number>`coalesce(sum(${markets.volume}), 0)`,
        trades: sql<number>`coalesce(sum(${markets.tradeCount}), 0)`,
      })
      .from(markets)
      .groupBy(markets.category),
    db
      .select({
        id: markets.id,
        title: markets.title,
        volume: markets.volume,
        tradeCount: markets.tradeCount,
        probability: markets.probability,
        status: markets.status,
      })
      .from(markets)
      .orderBy(desc(markets.volume), desc(markets.tradeCount))
      .limit(10),
    db
      .select({ id: markets.id, title: markets.title, closesAt: markets.closesAt })
      .from(markets)
      .where(and(eq(markets.status, "open"), lt(markets.closesAt, nowDate)))
      .orderBy(markets.closesAt)
      .limit(20),
    db
      .select({ id: markets.id, title: markets.title, closesAt: markets.closesAt, probability: markets.probability })
      .from(markets)
      .where(and(eq(markets.status, "open"), gte(markets.closesAt, nowDate)))
      .orderBy(markets.closesAt)
      .limit(10),
    db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(8),
    db
      .select({ createdAt: trades.createdAt, amount: trades.amount, userId: trades.userId })
      .from(trades)
      .where(gte(trades.createdAt, windowStart))
      .limit(50_000),
    db.select({ createdAt: users.createdAt }).from(users).where(gte(users.createdAt, windowStart)).limit(50_000),
    getInboxCounts(now),
  ]);

  const statusCounts = Object.fromEntries(marketStatusRows.map((r) => [r.status, r.n])) as Record<string, number>;
  const marketsTotal = marketStatusRows.reduce((a, r) => a + r.n, 0);
  const flags = marketFlags[0] ?? { featured: 0, closing24h: 0, closing7d: 0, overdue: 0, added7d: 0 };

  // the daily series is folded in JS: SQLite has no timezone database, and the
  // chart has to be read in Israel time like every other date on the site
  const byDay = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * 86_400_000);
    byDay.set(key, { day: key, trades: 0, volume: 0, newUsers: 0 });
  }
  const activeUsers = new Set<string>();
  for (const t of recentTrades) {
    const p = byDay.get(dayKey(t.createdAt));
    if (p) {
      p.trades += 1;
      p.volume += t.amount;
    }
    if (now - t.createdAt.getTime() <= 7 * 86_400_000) activeUsers.add(t.userId);
  }
  for (const u of recentUsers) {
    const p = byDay.get(dayKey(u.createdAt));
    if (p) p.newUsers += 1;
  }

  const tradesTotal = tradeTotals[0]?.n ?? 0;
  const volumeTotal = tradeTotals[0]?.volume ?? 0;

  return {
    generatedAt: now,
    users: {
      total: userTotals[0]?.n ?? 0,
      new24h: newUsers24h[0]?.n ?? 0,
      new7d: newUsers7d[0]?.n ?? 0,
      traders: traderRows[0]?.all ?? 0,
      active7d: activeUsers.size,
      balance: userTotals[0]?.balance ?? 0,
    },
    markets: {
      total: marketsTotal,
      open: statusCounts.open ?? 0,
      resolved: statusCounts.resolved ?? 0,
      cancelled: statusCounts.cancelled ?? 0,
      featured: flags.featured ?? 0,
      closing24h: flags.closing24h ?? 0,
      closing7d: flags.closing7d ?? 0,
      overdue: flags.overdue ?? 0,
      added7d: flags.added7d ?? 0,
      byCreator: creatorRows.map((r) => ({ source: r.source, n: r.n })),
    },
    trading: {
      volume: volumeTotal,
      trades: tradesTotal,
      trades24h: trade24h[0]?.n ?? 0,
      volume24h: trade24h[0]?.volume ?? 0,
      trades7d: trade7d[0]?.n ?? 0,
      volume7d: trade7d[0]?.volume ?? 0,
      avgTrade: tradesTotal ? volumeTotal / tradesTotal : 0,
      openPositions: positionRows[0]?.n ?? 0,
      positionsValue: positionRows[0]?.value ?? 0,
      yesShare: tradesTotal ? (yesRows[0]?.n ?? 0) / tradesTotal : 0,
    },
    engagement: {
      comments: commentTotals[0]?.n ?? 0,
      comments7d: comments7d[0]?.n ?? 0,
      pricePoints: pricePoints[0]?.n ?? 0,
    },
    inbox,
    categories: categoryRows
      .map((r) => ({
        id: r.category,
        label: getCategory(r.category).label,
        open: r.open ?? 0,
        resolved: r.resolved ?? 0,
        volume: r.volume ?? 0,
        trades: r.trades ?? 0,
      }))
      .sort((a, b) => b.open - a.open),
    topMarkets,
    overdueMarkets,
    closingSoon,
    recentRuns,
    daily: [...byDay.values()],
  };
}
