import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { MAX_BET, MAX_SELL_SHARES, MIN_BET } from "./limits";
import { maxBuyAmount, maxSellShares, PRICE_BAND, priceYes, quoteBuy, quoteSell, type MarketState, type Side } from "./lmsr";

const { markets, positions, trades, priceHistory, users } = schema;

/** Machine-readable reason, so callers can react without matching Hebrew strings. */
export type TradeErrorCode =
  | "BAD_REQUEST"
  | "MARKET_NOT_FOUND"
  | "MARKET_CLOSED"
  | "USER_NOT_FOUND"
  | "INSUFFICIENT_BALANCE"
  | "NO_SHARES"
  | "AMOUNT_TOO_SMALL"
  | "AMOUNT_TOO_LARGE";

export class TradeError extends Error {
  constructor(message: string, public status = 400, public code: TradeErrorCode = "BAD_REQUEST") {
    super(message);
  }
}

/**
 * libSQL hands every transaction its own connection and `BEGIN IMMEDIATE` fails
 * instantly when another writer holds the lock. `busy_timeout` is deliberately
 * left at 0: the driver executes statements synchronously, so a busy handler
 * would block the event loop and stop the current holder from ever committing.
 * Retrying in JS is both safe (a rejected transaction applied nothing) and the
 * only thing that keeps a burst of rapid-mode answers from being dropped.
 */
const BUSY_RETRIES = 4;

export function isBusyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  return e.code === "SQLITE_BUSY" || /SQLITE_BUSY|database is locked/i.test(String(e.message ?? ""));
}

async function withBusyRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (err instanceof TradeError || attempt >= BUSY_RETRIES || !isBusyError(err)) throw err;
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt + Math.random() * 25));
    }
  }
}

export interface TradeRequest {
  userId: string;
  marketId: string;
  side: Side;
  action: "BUY" | "SELL";
  /** for BUY: amount of ₪ to spend. for SELL: number of shares to sell */
  quantity: number;
}

export const MIN_TRADE = MIN_BET;
/** A BUY is a bet, so it is capped in ₪ by the site-wide limit. */
export const MAX_TRADE = MAX_BET;
/** A SELL is measured in shares, not ₪ — see `MAX_SELL_SHARES`. */
export { MAX_SELL_SHARES };

export async function executeTrade(req: TradeRequest) {
  const db = await getDb();
  if (req.side !== "YES" && req.side !== "NO") throw new TradeError("צד לא תקין");
  if (req.action !== "BUY" && req.action !== "SELL") throw new TradeError("פעולה לא תקינה");
  const maxQuantity = req.action === "BUY" ? MAX_TRADE : MAX_SELL_SHARES;
  if (!Number.isFinite(req.quantity) || req.quantity < MIN_TRADE) {
    throw new TradeError("סכום לא תקין");
  }
  if (req.quantity > maxQuantity) {
    throw new TradeError(
      req.action === "BUY" ? `אפשר להמר עד ₪${MAX_TRADE} בעסקה אחת` : "סכום לא תקין",
      400,
      "AMOUNT_TOO_LARGE",
    );
  }

  return withBusyRetry(() => db.transaction(async (tx) => {
    const market = await tx.query.markets.findFirst({ where: eq(markets.id, req.marketId) });
    if (!market) throw new TradeError("השוק לא נמצא", 404, "MARKET_NOT_FOUND");
    const now = new Date();
    if (market.status !== "open" || market.closesAt.getTime() <= now.getTime()) {
      throw new TradeError("המסחר בשוק הזה סגור", 400, "MARKET_CLOSED");
    }
    const user = await tx.query.users.findFirst({ where: eq(users.id, req.userId) });
    if (!user) throw new TradeError("משתמש לא נמצא", 401, "USER_NOT_FOUND");

    let position = await tx.query.positions.findFirst({
      where: and(eq(positions.userId, req.userId), eq(positions.marketId, req.marketId)),
    });
    if (!position) {
      const [created] = await tx
        .insert(positions)
        .values({ userId: req.userId, marketId: req.marketId })
        .returning();
      position = created;
    }

    const state: MarketState = { qYes: market.qYes, qNo: market.qNo, b: market.liquidity };
    const isYes = req.side === "YES";
    const heldShares = isYes ? position.yesShares : position.noShares;
    const heldCost = isYes ? position.yesCost : position.noCost;

    let quote;
    let newBalance = user.balance;
    let newShares = heldShares;
    let newCost = heldCost;
    let realized = 0;

    if (req.action === "BUY") {
      if (req.quantity > user.balance + 1e-9) throw new TradeError("אין מספיק יתרה", 400, "INSUFFICIENT_BALANCE");
      const cap = maxBuyAmount(state, req.side);
      if (cap <= 0) {
        throw new TradeError(`המחיר של הצד הזה כבר הגיע לתקרה (${Math.round(PRICE_BAND.max * 100)}%) ואי אפשר לקנות עוד`);
      }
      if (req.quantity > cap + 1e-6) {
        throw new TradeError(`העסקה גדולה מדי ותדחוף את השוק מעבר ל-${Math.round(PRICE_BAND.max * 100)}%. המקסימום כרגע: ₪${Math.floor(cap)}`);
      }
      quote = quoteBuy(state, req.side, req.quantity);
      if (!(quote.shares > 0) || !Number.isFinite(quote.shares)) throw new TradeError("הסכום קטן מדי", 400, "AMOUNT_TOO_SMALL");
      newBalance = user.balance - quote.amount;
      newShares = heldShares + quote.shares;
      newCost = heldCost + quote.amount;
    } else {
      const sellShares = Math.min(req.quantity, heldShares);
      if (sellShares <= 1e-9) throw new TradeError("אין לך מניות למכירה", 400, "NO_SHARES");
      const sellCap = maxSellShares(state, req.side);
      if (sellShares > sellCap + 1e-6) {
        throw new TradeError(
          sellCap <= 0
            ? `המחיר של הצד הזה כבר הגיע לרצפה (${Math.round(PRICE_BAND.min * 100)}%) ואי אפשר למכור עוד`
            : `המכירה גדולה מדי ותדחוף את השוק מתחת ל-${Math.round(PRICE_BAND.min * 100)}%. המקסימום כרגע: ${Math.floor(sellCap)} מניות`,
        );
      }
      quote = quoteSell(state, req.side, sellShares);
      newBalance = user.balance + quote.amount;
      newShares = heldShares - sellShares;
      const costPortion = heldShares > 0 ? heldCost * (sellShares / heldShares) : 0;
      newCost = heldCost - costPortion;
      realized = quote.amount - costPortion;
      if (newShares < 1e-6) {
        newShares = 0;
        newCost = 0;
      }
    }

    const signedShares = req.action === "BUY" ? quote.shares : -quote.shares;
    const newQYes = isYes ? market.qYes + signedShares : market.qYes;
    const newQNo = isYes ? market.qNo : market.qNo + signedShares;
    const newProb = priceYes({ qYes: newQYes, qNo: newQNo, b: market.liquidity });
    if (!Number.isFinite(newProb)) throw new TradeError("שגיאת חישוב, נסו סכום אחר");

    await tx
      .update(markets)
      .set({
        qYes: newQYes,
        qNo: newQNo,
        probability: newProb,
        volume: market.volume + quote.amount,
        tradeCount: market.tradeCount + 1,
        updatedAt: now,
      })
      .where(eq(markets.id, market.id));

    await tx
      .update(positions)
      .set(
        isYes
          ? { yesShares: newShares, yesCost: newCost, realizedPnl: position.realizedPnl + realized, updatedAt: now }
          : { noShares: newShares, noCost: newCost, realizedPnl: position.realizedPnl + realized, updatedAt: now },
      )
      .where(eq(positions.id, position.id));

    await tx.update(users).set({ balance: newBalance }).where(eq(users.id, user.id));

    const [trade] = await tx
      .insert(trades)
      .values({
        userId: user.id,
        marketId: market.id,
        side: req.side,
        action: req.action,
        shares: quote.shares,
        amount: quote.amount,
        priceBefore: quote.priceBefore,
        priceAfter: quote.priceAfter,
        createdAt: now,
      })
      .returning();

    await tx.insert(priceHistory).values({ marketId: market.id, probability: newProb, ts: now });

    return {
      trade,
      quote,
      balance: newBalance,
      probability: newProb,
      position: { side: req.side, shares: newShares, cost: newCost },
    };
  }));
}

/** Settle all positions of a market. Pays 1 ₪ per winning share; refunds cost basis on cancel. */
export async function settleMarket(
  marketId: string,
  outcome: "YES" | "NO" | "CANCELLED",
  note: string | undefined,
  resolvedAt: Date,
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const market = await tx.query.markets.findFirst({ where: eq(markets.id, marketId) });
    if (!market) throw new Error(`market ${marketId} not found`);
    if (market.status !== "open") return { settled: 0, already: true };

    const open = await tx.select().from(positions).where(and(eq(positions.marketId, marketId), eq(positions.settled, false)));
    let settled = 0;
    for (const pos of open) {
      let payout = 0;
      let pnl = 0;
      if (outcome === "CANCELLED") {
        payout = pos.yesCost + pos.noCost;
        pnl = 0;
      } else if (outcome === "YES") {
        payout = pos.yesShares;
        pnl = payout - pos.yesCost - pos.noCost;
      } else {
        payout = pos.noShares;
        pnl = payout - pos.yesCost - pos.noCost;
      }
      if (payout > 0) {
        await tx.update(users).set({ balance: sql`${users.balance} + ${payout}` }).where(eq(users.id, pos.userId));
      }
      await tx
        .update(positions)
        .set({ settled: true, realizedPnl: pos.realizedPnl + pnl, updatedAt: resolvedAt })
        .where(eq(positions.id, pos.id));
      settled++;
    }
    const finalProb = outcome === "YES" ? 1 : outcome === "NO" ? 0 : market.probability;
    await tx
      .update(markets)
      .set({
        status: outcome === "CANCELLED" ? "cancelled" : "resolved",
        resolution: outcome === "CANCELLED" ? null : outcome,
        resolutionNote: note ?? null,
        resolvedAt,
        probability: finalProb,
        updatedAt: resolvedAt,
      })
      .where(eq(markets.id, marketId));
    if (outcome !== "CANCELLED") {
      await tx.insert(priceHistory).values({ marketId, probability: finalProb, ts: resolvedAt });
    }
    return { settled, already: false };
  });
}
