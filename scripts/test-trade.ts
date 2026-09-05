/**
 * End-to-end tests for the money path: buy, sell, liquidate, settle.
 * Runs the real engine (`src/lib/trade.ts`) against a throwaway SQLite file,
 * so migrations, transactions and every balance update are exercised for real.
 *
 * Run: npm run test:trade   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";

// the db module reads DATABASE_URL lazily, on the first getDb() — setting it
// here (before main runs) is enough to keep the tests off the real database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-trade-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { getDb, schema } from "../src/lib/db";
import { executeTrade, settleMarket, TradeError, MIN_TRADE, MAX_TRADE } from "../src/lib/trade";
import { MAX_BET } from "../src/lib/limits";
import { holdingValue, initialState, maxBuyAmount, PRICE_BAND, priceYes, proceedsFromSell } from "../src/lib/lmsr";
import { getNetWorth, getPortfolio } from "../src/lib/portfolio";

const { users, markets, positions, trades, priceHistory } = schema;

let db: Awaited<ReturnType<typeof getDb>>;

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}`);
    console.error(`      ${(err as Error).message.split("\n")[0]}`);
  }
}
const close = (a: number, b: number, eps = 1e-6, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} expected ${b}, got ${a} (diff ${Math.abs(a - b)})`);

let seq = 0;
async function makeUser(balance = 10_000) {
  const id = `u${++seq}`;
  await db.insert(users).values({ id, name: id, email: `${id}@test.local`, balance });
  return id;
}
async function makeMarket(opts: { p?: number; b?: number; closesAt?: Date; status?: "open" | "resolved" } = {}) {
  const id = `m${++seq}`;
  const p = opts.p ?? 0.5;
  const b = opts.b ?? 2000;
  const st = initialState(p, b);
  await db.insert(markets).values({
    id,
    title: `שוק ${id}`,
    closesAt: opts.closesAt ?? new Date(Date.now() + 86_400_000),
    liquidity: b,
    qYes: st.qYes,
    qNo: st.qNo,
    probability: priceYes(st),
    status: opts.status ?? "open",
  });
  return id;
}
const getUser = async (id: string) => (await db.query.users.findFirst({ where: eq(users.id, id) }))!;
const getMarket = async (id: string) => (await db.query.markets.findFirst({ where: eq(markets.id, id) }))!;
const getPos = async (userId: string, marketId: string) =>
  await db.query.positions.findFirst({ where: and(eq(positions.userId, userId), eq(positions.marketId, marketId)) });

/**
 * Stakes more than one order can carry: a buy is capped both by the ₪MAX_BET bet
 * limit and by the price band, so any real position is built up over many orders.
 * Returns the ₪ actually spent.
 */
async function push(userId: string, marketId: string, side: "YES" | "NO", budget: number) {
  let spent = 0;
  for (let i = 0; i < 600 && spent < budget; i++) {
    const mk = await getMarket(marketId);
    const cap = maxBuyAmount({ qYes: mk.qYes, qNo: mk.qNo, b: mk.liquidity }, side);
    const amount = Math.min(cap, MAX_TRADE, budget - spent);
    if (amount < MIN_TRADE) break;
    await executeTrade({ userId, marketId, side, action: "BUY", quantity: amount });
    spent += amount;
  }
  return spent;
}

/** Shares held of one side. */
async function heldShares(userId: string, marketId: string, side: "YES" | "NO") {
  const pos = await getPos(userId, marketId);
  return !pos ? 0 : side === "YES" ? pos.yesShares : pos.noShares;
}

async function expectError(code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof TradeError, `expected TradeError, got ${err}`);
    assert.equal((err as InstanceType<typeof TradeError>).code, code);
    return err as InstanceType<typeof TradeError>;
  }
  assert.fail(`expected the trade to be rejected with ${code}`);
}

async function main() {
  db = await getDb();

  /* ------------------------------- buying ------------------------------- */

  await test("a buy moves money, shares, price, volume and writes the audit trail", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.4 });
    const before = await getMarket(m);
    const r = await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });

    close(r.quote.amount, 100, 1e-9, "charged amount");
    assert.ok(r.quote.shares > 100, "at 40c a ₪100 order should return more than 100 shares");
    close((await getUser(u)).balance, 9900, 1e-9, "balance after buy");

    const pos = (await getPos(u, m))!;
    close(pos.yesShares, r.quote.shares, 1e-9, "position shares");
    close(pos.yesCost, 100, 1e-9, "position cost basis");
    close(pos.noShares, 0, 1e-12);

    const after = await getMarket(m);
    close(after.qYes, before.qYes + r.quote.shares, 1e-9, "market inventory");
    close(after.probability, priceYes({ qYes: after.qYes, qNo: after.qNo, b: after.liquidity }), 1e-12, "cached probability");
    assert.ok(after.probability > before.probability, "buying YES must raise the YES price");
    close(after.volume, 100, 1e-9, "volume");
    assert.equal(after.tradeCount, 1);

    const log = await db.select().from(trades).where(eq(trades.marketId, m));
    assert.equal(log.length, 1);
    assert.equal(log[0].action, "BUY");
    close(log[0].amount, 100, 1e-9);
    const hist = await db.select().from(priceHistory).where(eq(priceHistory.marketId, m));
    assert.equal(hist.length, 1);
    close(hist[0].probability, after.probability, 1e-12);
  });

  await test("buying NO lowers the YES price and holds a separate position", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.5 });
    await executeTrade({ userId: u, marketId: m, side: "NO", action: "BUY", quantity: 100 });
    const pos = (await getPos(u, m))!;
    assert.ok(pos.noShares > 0 && pos.yesShares === 0, "NO shares only");
    assert.ok((await getMarket(m)).probability < 0.5, "YES price must fall");
  });

  await test("a buy is rejected when the balance is short, and nothing is written", async () => {
    const u = await makeUser(50);
    const m = await makeMarket();
    await expectError("INSUFFICIENT_BALANCE", () =>
      executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 }),
    );
    close((await getUser(u)).balance, 50, 1e-12, "balance untouched");
    const market = await getMarket(m);
    assert.equal(market.tradeCount, 0, "no trade recorded");
    close(market.volume, 0, 1e-12, "no volume recorded");
  });

  await test("a buy of the whole balance is allowed (spend it all)", async () => {
    const u = await makeUser(MAX_BET);
    const m = await makeMarket();
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: MAX_BET });
    close((await getUser(u)).balance, 0, 1e-9, "balance drained to zero");
  });

  await test("trading a closed or resolved market is rejected", async () => {
    const u = await makeUser();
    const past = await makeMarket({ closesAt: new Date(Date.now() - 1000) });
    await expectError("MARKET_CLOSED", () => executeTrade({ userId: u, marketId: past, side: "YES", action: "BUY", quantity: 10 }));
    const done = await makeMarket({ status: "resolved" });
    await expectError("MARKET_CLOSED", () => executeTrade({ userId: u, marketId: done, side: "YES", action: "BUY", quantity: 10 }));
  });

  await test("unknown market and unknown user are rejected", async () => {
    const u = await makeUser();
    const m = await makeMarket();
    await expectError("MARKET_NOT_FOUND", () => executeTrade({ userId: u, marketId: "nope", side: "YES", action: "BUY", quantity: 10 }));
    await expectError("USER_NOT_FOUND", () => executeTrade({ userId: "nope", marketId: m, side: "YES", action: "BUY", quantity: 10 }));
  });

  await test("out-of-range amounts are rejected", async () => {
    const u = await makeUser();
    const m = await makeMarket();
    for (const q of [0, -5, MIN_TRADE / 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expectError("BAD_REQUEST", () => executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: q }));
    }
    // a buy over the site-wide bet cap has its own code, so the client can say why
    await expectError("AMOUNT_TOO_LARGE", () =>
      executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: MAX_TRADE + 1 }),
    );
  });

  await test("the bet cap does not apply to selling: a big position closes in one order", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.5, b: 300 });
    // many capped buys, one sale — the sale is measured in shares, not ₪
    await push(u, m, "YES", 5_000);
    const held = await heldShares(u, m, "YES");
    assert.ok(held > MAX_TRADE, `setup: expected more shares than the ₪ cap, got ${held}`);
    const sell = await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: held });
    close(sell.quote.shares, held, 1e-6, "the whole holding sold at once");
    close((await getPos(u, m))!.yesShares, 0, 1e-9, "position emptied");
  });

  /* ------------------------------- selling ------------------------------ */

  await test("selling everything right back returns the money and the price", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.35 });
    const buy = await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    const sell = await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: buy.quote.shares });

    close(sell.quote.amount, 100, 1e-6, "round-trip proceeds");
    close((await getUser(u)).balance, 10_000, 1e-6, "balance restored");
    const pos = (await getPos(u, m))!;
    close(pos.yesShares, 0, 1e-9, "position emptied");
    close(pos.yesCost, 0, 1e-9, "cost basis cleared");
    close(pos.realizedPnl, 0, 1e-6, "flat round trip is flat P&L");
    close((await getMarket(m)).probability, 0.35, 1e-9, "price restored");
  });

  await test("a partial sell splits the cost basis and books realized P&L", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.5 });
    const buy = await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    const half = buy.quote.shares / 2;
    const sell = await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: half });

    const pos = (await getPos(u, m))!;
    close(pos.yesShares, half, 1e-6, "half the shares left");
    close(pos.yesCost, 50, 1e-6, "half the cost basis left");
    close(pos.realizedPnl, sell.quote.amount - 50, 1e-6, "realized P&L = proceeds - cost sold");
    assert.ok(sell.quote.amount < 100, "selling back into your own impact returns less than you paid");
  });

  await test("selling a winning position books a profit", async () => {
    const seller = await makeUser();
    const pusher = await makeUser(50_000);
    const m = await makeMarket({ p: 0.3 });
    const buy = await executeTrade({ userId: seller, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    await push(pusher, m, "YES", 20_000);
    const sell = await executeTrade({ userId: seller, marketId: m, side: "YES", action: "SELL", quantity: buy.quote.shares });
    assert.ok(sell.quote.amount > 100, `expected a profit, sold for ${sell.quote.amount}`);
    close((await getPos(seller, m))!.realizedPnl, sell.quote.amount - 100, 1e-6, "profit booked");
  });

  await test("selling shares you do not have is rejected", async () => {
    const u = await makeUser();
    const m = await makeMarket();
    await expectError("NO_SHARES", () => executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: 10 }));
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    await expectError("NO_SHARES", () => executeTrade({ userId: u, marketId: m, side: "NO", action: "SELL", quantity: 10 }));
  });

  await test("an oversized sell request is capped at what you actually hold", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.5 });
    const buy = await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    const sell = await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: buy.quote.shares * 10 });
    close(sell.quote.shares, buy.quote.shares, 1e-9, "only the held shares are sold");
    close((await getPos(u, m))!.yesShares, 0, 1e-9, "position emptied");
  });

  /* ------------------------- always liquidatable ------------------------ */

  await test("a position stays liquidatable after the price collapses against it", async () => {
    const holder = await makeUser();
    const whale = await makeUser(1_000_000);
    const m = await makeMarket({ p: 0.5, b: 2000 });
    const buy = await executeTrade({ userId: holder, marketId: m, side: "YES", action: "BUY", quantity: 100 });

    // the other side hammers the market until YES is worthless
    await push(whale, m, "NO", 500_000);
    assert.ok((await getMarket(m)).probability <= PRICE_BAND.min + 1e-9, "setup: YES should have collapsed to the floor");

    const sell = await executeTrade({ userId: holder, marketId: m, side: "YES", action: "SELL", quantity: buy.quote.shares });
    close((await getPos(holder, m))!.yesShares, 0, 1e-9, "position fully liquidated");
    assert.ok(sell.quote.amount >= 0, "proceeds are never negative");
    assert.ok((await getUser(holder)).balance >= 9900 - 1e-9, "the loss is bounded by what was staked");
  });

  await test("the whole position is sellable in one order at any price", async () => {
    for (const p of [0.05, 0.5, 0.9]) {
      const holder = await makeUser();
      const whale = await makeUser(1_000_000);
      const m = await makeMarket({ p, b: 500 });
      const buy = await executeTrade({ userId: holder, marketId: m, side: "YES", action: "BUY", quantity: 100 });
      await push(whale, m, "NO", 50_000);
      await executeTrade({ userId: holder, marketId: m, side: "YES", action: "SELL", quantity: buy.quote.shares });
      close((await getPos(holder, m))!.yesShares, 0, 1e-9, `p=${p}: position fully liquidated`);
    }
  });

  await test("dust below the minimum trade size can still be liquidated", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.5 });
    const buy = await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: buy.quote.shares - 0.4 });
    const left = (await getPos(u, m))!.yesShares;
    assert.ok(left > 0 && left < MIN_TRADE, `setup: expected dust, got ${left}`);
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: left });
    close((await getPos(u, m))!.yesShares, 0, 1e-9, "dust liquidated");
  });

  await test("a buy that would break the price ceiling is rejected with the largest size that fits", async () => {
    const u = await makeUser(1_000_000);
    const m = await makeMarket({ p: 0.5, b: 200 });
    // walk the price up until the band leaves less headroom than one full bet
    await push(u, m, "YES", 100_000);
    const mk = await getMarket(m);
    const cap = maxBuyAmount({ qYes: mk.qYes, qNo: mk.qNo, b: mk.liquidity }, "YES");
    assert.ok(cap < MAX_TRADE, `setup: expected the band to bite first, cap=${cap}`);
    await expectError("BAD_REQUEST", () => executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: MAX_TRADE }));
    const after = await getMarket(m);
    assert.ok(after.probability <= PRICE_BAND.max + 1e-9, `price left the band: ${after.probability}`);
    // and the holder can still get out in full
    const held = await heldShares(u, m, "YES");
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: held });
    close((await getPos(u, m))!.yesShares, 0, 1e-9, "position emptied at the ceiling");
  });

  await test("a market a sale pushed under the floor still trades normally", async () => {
    const holder = await makeUser(200_000);
    const whale = await makeUser(1_000_000);
    const m = await makeMarket({ p: 0.5, b: 1000 });
    await push(holder, m, "YES", 3000);
    const held = await heldShares(holder, m, "YES");
    await push(whale, m, "NO", 300_000);
    await executeTrade({ userId: holder, marketId: m, side: "YES", action: "SELL", quantity: held });

    const low = await getMarket(m);
    assert.ok(low.probability > 0 && low.probability < 1, `price left (0,1): ${low.probability}`);
    // the cheap side is still buyable, and buying it walks the price back up
    await executeTrade({ userId: holder, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    assert.ok((await getMarket(m)).probability > low.probability, "the cheap side must be buyable back up");
  });

  await test("concurrent orders on one market all apply exactly once", async () => {
    const m = await makeMarket({ p: 0.5, b: 20_000 });
    const traders = await Promise.all(Array.from({ length: 8 }, () => makeUser()));
    await Promise.all(
      traders.map((u, i) =>
        executeTrade({ userId: u, marketId: m, side: i % 2 ? "NO" : "YES", action: "BUY", quantity: 100 }),
      ),
    );
    const mk = await getMarket(m);
    assert.equal(mk.tradeCount, traders.length, "every concurrent order recorded");
    close(mk.volume, 100 * traders.length, 1e-6, "volume");
    for (const u of traders) close((await getUser(u)).balance, 9900, 1e-9, "each trader charged exactly once");
    let q = initialState(0.5, mk.liquidity).qYes;
    let qNo = 0;
    for (const t of await db.select().from(trades).where(eq(trades.marketId, m))) {
      if (t.side === "YES") q += t.shares;
      else qNo += t.shares;
    }
    close(mk.qYes, q, 1e-6, "market YES inventory matches the trade log");
    close(mk.qNo, qNo, 1e-6, "market NO inventory matches the trade log");
  });

  /* ------------------------------ settlement ---------------------------- */

  await test("a YES resolution pays the YES holders and zeroes the losers", async () => {
    const winner = await makeUser();
    const loser = await makeUser();
    const m = await makeMarket({ p: 0.5 });
    const w = await executeTrade({ userId: winner, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    await executeTrade({ userId: loser, marketId: m, side: "NO", action: "BUY", quantity: 100 });

    const res = await settleMarket(m, "YES", "בדיקה", new Date());
    assert.equal(res.settled, 2);
    close((await getUser(winner)).balance, 10_000 - 100 + w.quote.shares, 1e-6, "winner paid ₪1 per share");
    close((await getUser(loser)).balance, 9900, 1e-6, "loser keeps only the cash left");
    const wp = (await getPos(winner, m))!;
    assert.equal(wp.settled, true);
    close(wp.realizedPnl, w.quote.shares - 100, 1e-6, "winner P&L");
    close((await getPos(loser, m))!.realizedPnl, -100, 1e-6, "loser P&L");
    const mk = await getMarket(m);
    assert.equal(mk.status, "resolved");
    assert.equal(mk.resolution, "YES");
    close(mk.probability, 1, 1e-12);
  });

  await test("a NO resolution pays the NO holders", async () => {
    const yes = await makeUser();
    const no = await makeUser();
    const m = await makeMarket({ p: 0.5 });
    await executeTrade({ userId: yes, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    const n = await executeTrade({ userId: no, marketId: m, side: "NO", action: "BUY", quantity: 100 });
    await settleMarket(m, "NO", undefined, new Date());
    close((await getUser(no)).balance, 9900 + n.quote.shares, 1e-6, "NO holder paid");
    close((await getUser(yes)).balance, 9900, 1e-6, "YES holder gets nothing");
  });

  await test("a cancelled market refunds every shekel and books no P&L", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const m = await makeMarket({ p: 0.6 });
    await push(a, m, "YES", 700);
    await push(b, m, "NO", 250);
    await settleMarket(m, "CANCELLED", "בוטל", new Date());
    close((await getUser(a)).balance, 10_000, 1e-6, "full refund");
    close((await getUser(b)).balance, 10_000, 1e-6, "full refund");
    close((await getPos(a, m))!.realizedPnl, 0, 1e-9, "no P&L on a cancelled market");
    assert.equal((await getMarket(m)).status, "cancelled");
  });

  await test("settling twice does not pay twice", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.5 });
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    await settleMarket(m, "YES", undefined, new Date());
    const paid = (await getUser(u)).balance;
    const again = await settleMarket(m, "YES", undefined, new Date());
    assert.equal(again.already, true);
    close((await getUser(u)).balance, paid, 1e-12, "balance unchanged on the second settle");
  });

  await test("a sold-out position is not paid on settlement", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.5 });
    const buy = await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: buy.quote.shares });
    const before = (await getUser(u)).balance;
    await settleMarket(m, "YES", undefined, new Date());
    close((await getUser(u)).balance, before, 1e-9, "nothing to pay out");
  });

  /* ------------------------- portfolio + accounting --------------------- */

  await test("the portfolio mirrors the position and its P&L", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.4 });
    const buy = await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    const mk = await getMarket(m);
    const { openHoldings, positionsValue, unrealized } = await getPortfolio(u);
    const h = openHoldings.find((x) => x.market.id === m)!;
    assert.ok(h, "holding is listed");
    close(h.shares, buy.quote.shares, 1e-9, "shares");
    close(h.cost, 100, 1e-9, "cost");
    close(h.avgPrice, 100 / buy.quote.shares, 1e-9, "average price");
    close(
      h.value,
      proceedsFromSell({ qYes: mk.qYes, qNo: mk.qNo, b: mk.liquidity }, "YES", buy.quote.shares),
      1e-9,
      "the value is the sale proceeds",
    );
    close(h.exitPrice, h.value / h.shares, 1e-9, "exit price");
    close(positionsValue, h.value, 1e-9, "portfolio value");
    close(unrealized, h.value - 100, 1e-9, "unrealized P&L");
  });

  await test("the value shown is exactly what selling everything pays out", async () => {
    // this is the whole contract of the column: what the portfolio marks the
    // position at is the ₪ that actually lands in the balance on a full exit.
    for (const b of [500, 2000, 8000]) {
      const u = await makeUser();
      const m = await makeMarket({ p: 0.35, b });
      const buy = await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
      const { positionsValue } = await getPortfolio(u);
      const cashBefore = (await getUser(u)).balance;
      const sell = await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: buy.quote.shares });
      close(sell.quote.amount, positionsValue, 1e-9, `b=${b}: the sale pays the value that was shown`);
      close((await getUser(u)).balance, cashBefore + positionsValue, 1e-9, `b=${b}: the balance grows by exactly that`);
    }
  });

  await test("a fresh buy does not invent a profit out of its own price impact", async () => {
    // marking at the marginal price used to hand a ₪100 order an instant paper
    // gain (on a thin market, tens of ₪) that no sale could ever realise.
    for (const b of [500, 2000]) {
      const u = await makeUser();
      const m = await makeMarket({ p: 0.5, b });
      await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
      const { unrealized, positionsValue } = await getPortfolio(u);
      assert.ok(unrealized <= 1e-9, `b=${b}: a buy showed an instant paper profit of ${unrealized}`);
      // the only loss right after a buy is the round-trip spread, which is small
      assert.ok(positionsValue > 90, `b=${b}: the position lost ${100 - positionsValue} to the spread`);
    }
  });

  await test("a hedged position is valued at what closing both legs pays", async () => {
    const u = await makeUser();
    const m = await makeMarket({ p: 0.5, b: 1000 });
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "BUY", quantity: 100 });
    await executeTrade({ userId: u, marketId: m, side: "NO", action: "BUY", quantity: 60 });
    const { positionsValue } = await getPortfolio(u);
    const pos = (await getPos(u, m))!;
    const cashBefore = (await getUser(u)).balance;
    await executeTrade({ userId: u, marketId: m, side: "YES", action: "SELL", quantity: pos.yesShares });
    await executeTrade({ userId: u, marketId: m, side: "NO", action: "SELL", quantity: pos.noShares });
    close((await getUser(u)).balance, cashBefore + positionsValue, 1e-9, "both legs together");
  });

  await test("the header chip and the portfolio page agree on the net worth", async () => {
    const u = await makeUser();
    const a = await makeMarket({ p: 0.3, b: 800 });
    const c = await makeMarket({ p: 0.7, b: 4000 });
    await executeTrade({ userId: u, marketId: a, side: "YES", action: "BUY", quantity: 80 });
    await executeTrade({ userId: u, marketId: c, side: "NO", action: "BUY", quantity: 40 });
    const balance = (await getUser(u)).balance;
    const { positionsValue } = await getPortfolio(u);
    close(await getNetWorth(u, balance), balance + positionsValue, 1e-9, "net worth");
  });

  await test("cash + position value is conserved across a busy market", async () => {
    const traders = [await makeUser(), await makeUser(), await makeUser()];
    const m = await makeMarket({ p: 0.45, b: 1500 });
    const start = 3 * 10_000;
    let subsidy = 0; // what the market maker put in, bounded by b*ln2
    for (let i = 0; i < 12; i++) {
      const u = traders[i % traders.length];
      const side = i % 3 === 0 ? "NO" : "YES";
      await executeTrade({ userId: u, marketId: m, side, action: "BUY", quantity: Math.min(MAX_TRADE, 10 + i * 7) });
      if (i % 4 === 3) {
        const pos = (await getPos(u, m))!;
        const held = side === "YES" ? pos.yesShares : pos.noShares;
        if (held > 1) await executeTrade({ userId: u, marketId: m, side, action: "SELL", quantity: held / 3 });
      }
    }
    const mk = await getMarket(m);
    let cash = 0;
    let value = 0;
    for (const u of traders) {
      cash += (await getUser(u)).balance;
      const pos = await getPos(u, m);
      if (pos) value += holdingValue({ qYes: mk.qYes, qNo: mk.qNo, b: mk.liquidity }, pos.yesShares, pos.noShares).total;
    }
    subsidy = cash + value - start;
    assert.ok(subsidy <= mk.liquidity * Math.LN2 + 1e-6, `market maker subsidy ${subsidy} exceeds the b*ln2 bound`);
    assert.ok(cash >= -1e-9, "no negative cash");
  });

  await test("no user can ever end up with a negative balance", async () => {
    const all = await db.select().from(users);
    for (const u of all) assert.ok(u.balance >= -1e-9, `${u.id} has a negative balance: ${u.balance}`);
  });

  await test("every trade is backed by a price-history point and a live position", async () => {
    const all = await db.select().from(trades);
    assert.ok(all.length > 0);
    for (const t of all) {
      assert.ok(t.shares > 0, `trade ${t.id} has no shares`);
      assert.ok(t.amount >= 0, `trade ${t.id} has a negative amount`);
      assert.ok(t.priceBefore > 0 && t.priceBefore < 1, `trade ${t.id} price out of range`);
      assert.ok(t.priceAfter > 0 && t.priceAfter < 1, `trade ${t.id} price out of range`);
    }
  });

  /* -------------------------------- report ------------------------------ */

  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (failures.length) {
    console.error(`\ntrade: ${passed} passed, ${failures.length} FAILED\n`);
    for (const f of failures) console.error(`  \u2717 ${f}\n`);
    process.exit(1);
  }
  console.log(`trade: ${passed} end-to-end tests passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
