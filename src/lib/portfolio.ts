import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import { STARTING_BALANCE } from "./db/schema";
import { toView, type MarketView } from "./markets";
import { getReferralEarningsByUser } from "./referral-program";

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

/**
 * One trader's standing. There is no name and no avatar here on purpose: the
 * leaderboard is anonymous, and the identity is not fetched rather than fetched
 * and hidden. `userId` stays server-side — it never reaches the page, which
 * receives the pseudonymous rows built by `src/lib/fake-leaderboard.ts`.
 */
export interface LeaderRow {
  userId: string;
  balance: number;
  positionsValue: number;
  netWorth: number;
  /** worth minus the capital the house handed over — the starting balance and any invite bonuses */
  pnl: number;
  /** ₪ earned from invites; part of net worth, deliberately not part of P&L */
  referralBonus: number;
  tradeCount: number;
}

/**
 * The same ranking with the account names attached, for the admin dashboard
 * only. It is a separate function on purpose: the public board must not be able
 * to reach a name by accident, so the identity is fetched exactly where someone
 * decided it should be — here — and nowhere else.
 */
export async function getTopTradersForAdmin(limit = 15): Promise<(LeaderRow & { name: string | null })[]> {
  const db = await getDb();
  const rows = await getLeaderboard(limit);
  const named = await db.select({ id: users.id, name: users.name }).from(users);
  const byId = new Map(named.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, name: byId.get(r.userId) ?? null }));
}

/** Every ranked trader, best first. The board is small enough to rank whole. */
export async function getLeaderboard(limit = 5_000): Promise<LeaderRow[]> {
  const db = await getDb();
  const allUsers = await db.select({ id: users.id, balance: users.balance }).from(users);
  const openPositions = await db
    .select({ p: positions, prob: markets.probability })
    .from(positions)
    .innerJoin(markets, eq(positions.marketId, markets.id))
    .where(and(eq(positions.settled, false), inArray(markets.status, ["open"])));
  const tradeCounts = await db.select({ userId: trades.userId, id: trades.id }).from(trades);
  const referralBonus = await getReferralEarningsByUser();

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
      const bonus = referralBonus.get(u.id) ?? 0;
      return {
        userId: u.id,
        balance: u.balance,
        positionsValue: pv,
        netWorth: net,
        pnl: net - STARTING_BALANCE - bonus,
        referralBonus: bonus,
        tradeCount: counts.get(u.id) ?? 0,
      };
    })
    .filter((r) => r.tradeCount > 0 || r.pnl !== 0)
    .sort((a, b) => b.netWorth - a.netWorth)
    .slice(0, limit);
}

/**
 * Cash plus the value of every position that is still open — the same "שווי כולל"
 * the portfolio page shows, but as one lean query so the header can render it.
 */
export async function getNetWorth(userId: string, balance: number): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({
      yesShares: positions.yesShares,
      noShares: positions.noShares,
      probability: markets.probability,
      status: markets.status,
      resolution: markets.resolution,
    })
    .from(positions)
    .innerJoin(markets, eq(positions.marketId, markets.id))
    .where(and(eq(positions.userId, userId), eq(positions.settled, false)));

  let value = 0;
  for (const r of rows) {
    const yes = r.status === "resolved" ? (r.resolution === "YES" ? 1 : 0) : r.probability;
    value += r.yesShares * yes + r.noShares * (1 - yes);
  }
  return balance + value;
}
