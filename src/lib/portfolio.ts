import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { STARTING_BALANCE } from "./db/schema";
import { toView, type MarketView } from "./markets";

const { positions, markets, users, trades } = schema;

export type PositionRow = typeof positions.$inferSelect;

export async function getPosition(userId: string, marketId: string): Promise<PositionRow | null> {
  const db = await getDb();
  const row = await db.query.positions.findFirst({
    where: and(eq(positions.userId, userId), eq(positions.marketId, marketId)),
  });
  return row ?? null;
}

export interface HoldingView {
  market: MarketView;
  side: "YES" | "NO";
  shares: number;
  cost: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  pnl: number;
  settled: boolean;
  realizedPnl: number;
}

export async function getPortfolio(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ p: positions, m: markets })
    .from(positions)
    .innerJoin(markets, eq(positions.marketId, markets.id))
    .where(eq(positions.userId, userId))
    .orderBy(desc(positions.updatedAt));

  const holdings: HoldingView[] = [];
  let realized = 0;
  for (const { p, m } of rows) {
    realized += p.realizedPnl;
    const view = toView(m);
    const finalYes = m.status === "resolved" ? (m.resolution === "YES" ? 1 : 0) : m.probability;
    for (const side of ["YES", "NO"] as const) {
      const shares = side === "YES" ? p.yesShares : p.noShares;
      const cost = side === "YES" ? p.yesCost : p.noCost;
      if (shares <= 1e-6) continue;
      const price = side === "YES" ? finalYes : 1 - finalYes;
      const value = p.settled ? 0 : shares * price;
      holdings.push({
        market: view,
        side,
        shares,
        cost,
        avgPrice: shares > 0 ? cost / shares : 0,
        currentPrice: price,
        value,
        pnl: p.settled ? 0 : value - cost,
        settled: p.settled,
        realizedPnl: p.realizedPnl,
      });
    }
  }
  const openHoldings = holdings.filter((h) => !h.settled);
  const positionsValue = openHoldings.reduce((s, h) => s + h.value, 0);
  const unrealized = openHoldings.reduce((s, h) => s + h.pnl, 0);
  return { holdings, openHoldings, positionsValue, unrealized, realized };
}

export async function getUserTrades(userId: string, limit = 50) {
  const db = await getDb();
  return db
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
    .where(eq(trades.userId, userId))
    .orderBy(desc(trades.createdAt))
    .limit(limit);
}

export interface LeaderRow {
  userId: string;
  name: string | null;
  image: string | null;
  balance: number;
  positionsValue: number;
  netWorth: number;
  pnl: number;
  tradeCount: number;
}

export async function getLeaderboard(limit = 50): Promise<LeaderRow[]> {
  const db = await getDb();
  const allUsers = await db.select().from(users);
  const openPositions = await db
    .select({ p: positions, prob: markets.probability })
    .from(positions)
    .innerJoin(markets, eq(positions.marketId, markets.id))
    .where(and(eq(positions.settled, false), inArray(markets.status, ["open"])));
  const tradeCounts = await db.select({ userId: trades.userId, id: trades.id }).from(trades);

  const value = new Map<string, number>();
  for (const { p, prob } of openPositions) {
    value.set(p.userId, (value.get(p.userId) ?? 0) + p.yesShares * prob + p.noShares * (1 - prob));
  }
  const counts = new Map<string, number>();
  for (const t of tradeCounts) counts.set(t.userId, (counts.get(t.userId) ?? 0) + 1);

  return allUsers
    .map((u) => {
      const pv = value.get(u.id) ?? 0;
      const net = u.balance + pv;
      return {
        userId: u.id,
        name: u.name,
        image: u.image,
        balance: u.balance,
        positionsValue: pv,
        netWorth: net,
        pnl: net - STARTING_BALANCE,
        tradeCount: counts.get(u.id) ?? 0,
      };
    })
    .filter((r) => r.tradeCount > 0 || r.pnl !== 0)
    .sort((a, b) => b.netWorth - a.netWorth)
    .slice(0, limit);
}
