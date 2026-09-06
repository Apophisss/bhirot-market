/**
 * End-to-end tests for the writer behind the quiet-market drift
 * (`src/lib/market-drift.ts`), against a throwaway SQLite file — so the LMSR
 * write, the race guard and the history thinning are exercised for real.
 *
 * `scripts/test-drift.ts` covers the policy (how far, how often, when not to).
 * This covers what actually lands in the database:
 *   - the quote, the book and the recorded row never disagree,
 *   - nothing but the price moves,
 *   - a trade always beats a nudge,
 *   - and the old drift tail is thinned without touching one trade row.
 *
 * Run: npm run test:market-drift   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";

// the db module reads DATABASE_URL lazily, on the first getDb() — setting it
// here (before main runs) is enough to keep the tests off the real database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-drift-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { getDb, schema } from "../src/lib/db";
import { initialState, priceYes } from "../src/lib/lmsr";
import { driftBand, DEFAULT_DRIFT_CONFIG, DRIFT_HARD_MAX_DEVIATION, DRIFT_HARD_MAX_STEP } from "../src/lib/drift";
import { driftConfigFrom, runMarketDrift } from "../src/lib/market-drift";
import { executeTrade } from "../src/lib/trade";
import { getPriceHistory } from "../src/lib/markets";

const { users, markets, positions, trades, priceHistory } = schema;

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

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

let seq = 0;

/** A market that opened days ago, was priced once, and has been quiet ever since. */
async function makeQuietMarket(opts: { p?: number; b?: number; openedAgoMs?: number; closesInMs?: number } = {}) {
  const id = `m${++seq}`;
  const p = opts.p ?? 0.5;
  const b = opts.b ?? 2000;
  const openedAt = new Date(Date.now() - (opts.openedAgoMs ?? 10 * DAY));
  const st = initialState(p, b);
  await db.insert(markets).values({
    id,
    title: `שוק ${id}?`,
    closesAt: new Date(Date.now() + (opts.closesInMs ?? 30 * DAY)),
    liquidity: b,
    qYes: st.qYes,
    qNo: st.qNo,
    probability: priceYes(st),
    createdAt: openedAt,
    updatedAt: openedAt,
  });
  await db.insert(priceHistory).values({ marketId: id, probability: priceYes(st), ts: openedAt, source: "trade" });
  return id;
}

const getMarket = async (id: string) => (await db.query.markets.findFirst({ where: eq(markets.id, id) }))!;
const rowsFor = async (id: string) =>
  await db.select().from(priceHistory).where(eq(priceHistory.marketId, id)).orderBy(priceHistory.id);

async function main() {
  db = await getDb();

  await test("a quiet market moves, and the quote, the book and the row all agree", async () => {
    const id = await makeQuietMarket({ p: 0.4 });
    const before = await getMarket(id);
    const run = await runMarketDrift();
    const step = run.steps.find((s) => s.marketId === id);
    assert.ok(step, "the quiet market did not move");
    const after = await getMarket(id);
    assert.notEqual(after.probability, before.probability, "the probability did not change");
    assert.ok(
      Math.abs(priceYes({ qYes: after.qYes, qNo: after.qNo, b: after.liquidity }) - after.probability) < 1e-12,
      "the cached probability and the LMSR book disagree",
    );
    const rows = await rowsFor(id);
    const last = rows[rows.length - 1];
    assert.equal(last.source, "drift", "the row was not marked as drift");
    assert.ok(Math.abs(last.probability - after.probability) < 1e-12, "the recorded row is not the current price");
    assert.ok(Math.abs(after.probability - before.probability) <= DEFAULT_DRIFT_CONFIG.maxStep + 1e-9, "a jump");
  });

  await test("nothing but the price moves — no volume, no trade count, no trade row", async () => {
    const id = await makeQuietMarket({ p: 0.6 });
    const before = await getMarket(id);
    await runMarketDrift();
    const after = await getMarket(id);
    assert.equal(after.volume, before.volume, "volume moved");
    assert.equal(after.tradeCount, before.tradeCount, "the trade count moved");
    assert.equal(after.qNo, before.qNo, "the NO leg moved");
    assert.equal(after.liquidity, before.liquidity, "the liquidity moved");
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), "updatedAt moved");
    const t = await db.select().from(trades).where(eq(trades.marketId, id));
    assert.equal(t.length, 0, "a trade was invented");
  });

  let justTraded = "";
  await test("a market that was answered minutes ago is left alone", async () => {
    const id = (justTraded = await makeQuietMarket({ p: 0.5 }));
    const uid = `u${++seq}`;
    await db.insert(users).values({ id: uid, name: uid, email: `${uid}@test.local`, balance: 10_000 });
    await executeTrade({ userId: uid, marketId: id, side: "YES", action: "BUY", quantity: 100 });
    const traded = await getMarket(id);
    const run = await runMarketDrift();
    assert.ok(!run.steps.some((s) => s.marketId === id), "drifted a market somebody just answered");
    const after = await getMarket(id);
    assert.equal(after.probability, traded.probability, "the traded price was overwritten");
  });

  await test("...and once it goes quiet, the wander is centred on the traded price", async () => {
    const id = justTraded; // the market answered in the previous test
    const traded = await getMarket(id);
    const run = await runMarketDrift({ now: Date.now() + 7 * HOUR });
    const step = run.steps.find((s) => s.marketId === id);
    assert.ok(step, "never woke up after the quiet window");
    assert.ok(Math.abs(step.anchor - traded.probability) < 1e-12, `anchored on ${step.anchor}, traded at ${traded.probability}`);
    const after = await getMarket(id);
    assert.ok(
      Math.abs(after.probability - traded.probability) <= driftBand(traded.probability) + 1e-9,
      "left the band around the traded price",
    );
  });

  await test("a position keeps its shares, and its value moves only as the price did", async () => {
    const id = await makeQuietMarket({ p: 0.5 });
    const uid = `u${++seq}`;
    await db.insert(users).values({ id: uid, name: uid, email: `${uid}@test.local`, balance: 10_000 });
    await executeTrade({ userId: uid, marketId: id, side: "YES", action: "BUY", quantity: 50 });
    const posBefore = (await db.query.positions.findFirst({
      where: and(eq(positions.userId, uid), eq(positions.marketId, id)),
    }))!;
    const balanceBefore = (await db.query.users.findFirst({ where: eq(users.id, uid) }))!.balance;
    await runMarketDrift({ now: Date.now() + 7 * HOUR });
    const posAfter = (await db.query.positions.findFirst({
      where: and(eq(positions.userId, uid), eq(positions.marketId, id)),
    }))!;
    assert.equal(posAfter.yesShares, posBefore.yesShares, "shares changed");
    assert.equal(posAfter.yesCost, posBefore.yesCost, "what they paid changed");
    assert.equal(posAfter.realizedPnl, posBefore.realizedPnl, "a profit was realised without a sale");
    assert.equal((await db.query.users.findFirst({ where: eq(users.id, uid) }))!.balance, balanceBefore, "balance changed");
  });

  await test("the thinning pass runs at most once an hour, not on every tick", async () => {
    // the first run of the process thins; the next one inside the hour must not
    const first = await runMarketDrift({ now: Date.now() + 20 * DAY });
    const second = await runMarketDrift({ now: Date.now() + 20 * DAY + 10 * MIN });
    assert.equal(second.thinned, 0, "thinned twice inside the same hour");
    assert.ok(first.thinned >= 0);
  });

  await test("a second pass in the same minute writes nothing", async () => {
    const id = await makeQuietMarket({ p: 0.45 });
    await runMarketDrift();
    const rows = (await rowsFor(id)).length;
    const again = await runMarketDrift();
    assert.ok(!again.steps.some((s) => s.marketId === id), "moved twice inside the minimum interval");
    assert.equal((await rowsFor(id)).length, rows, "wrote a second row anyway");
  });

  await test("a dry run reports the same move it would have written, and writes nothing", async () => {
    const id = await makeQuietMarket({ p: 0.33 });
    const at = Date.now() + 3 * HOUR;
    const dry = await runMarketDrift({ now: at, dryRun: true });
    const planned = dry.steps.find((s) => s.marketId === id);
    assert.ok(planned, "planned nothing for a quiet market");
    assert.equal((await rowsFor(id)).length, 1, "a dry run wrote a row");
    const wet = await runMarketDrift({ now: at });
    const done = wet.steps.find((s) => s.marketId === id);
    assert.ok(done && Math.abs(done.to - planned.to) < 1e-9, `dry run said ${planned.to}, the write did ${done?.to}`);
  });

  await test("the environment can switch the drift off or slow it down, never widen it", async () => {
    assert.equal(driftConfigFrom({}).enabled, true, "the default is on");
    assert.equal(driftConfigFrom({ MARKET_DRIFT: "off" }).enabled, false, "MARKET_DRIFT=off did not switch it off");
    // a greedy value is capped, a small one is honoured, junk falls back to the default
    assert.equal(driftConfigFrom({ MARKET_DRIFT_MAX_DEV: "0.9" }).maxDeviation, DRIFT_HARD_MAX_DEVIATION);
    assert.equal(driftConfigFrom({ MARKET_DRIFT_MAX_DEV: "0.01" }).maxDeviation, 0.01);
    assert.equal(driftConfigFrom({ MARKET_DRIFT_MAX_DEV: "nonsense" }).maxDeviation, DEFAULT_DRIFT_CONFIG.maxDeviation);
    assert.equal(driftConfigFrom({ MARKET_DRIFT_MAX_STEP: "5" }).maxStep, DRIFT_HARD_MAX_STEP);
    assert.equal(driftConfigFrom({ MARKET_DRIFT_QUIET_HOURS: "12" }).quietMs, 12 * HOUR);
    assert.equal(driftConfigFrom({ MARKET_DRIFT_QUIET_HOURS: "0" }).quietMs, 0.25 * HOUR, "no floor on the quiet window");
    assert.equal(driftConfigFrom({ MARKET_DRIFT_SALT: "x" }).seedSalt, "x");
  });

  await test("a run with the drift switched off touches nothing", async () => {
    const id = await makeQuietMarket({ p: 0.5 });
    const before = await getMarket(id);
    const run = await runMarketDrift({ config: driftConfigFrom({ MARKET_DRIFT: "off" }) });
    assert.equal(run.moved, 0, "moved a market with the drift switched off");
    assert.deepEqual(run.skipped, { disabled: 1 });
    assert.equal((await getMarket(id)).probability, before.probability, "the price moved anyway");
  });

  await test("the old drift tail is thinned, and not one trade row is touched", async () => {
    const id = await makeQuietMarket({ p: 0.5, openedAgoMs: 40 * DAY });
    const now = Date.now();
    // 30 days of ticks every half hour, plus a handful of real trades scattered through it
    const drift = [];
    for (let t = now - 30 * DAY; t < now - 4 * DAY; t += 30 * MIN) {
      drift.push({ marketId: id, probability: 0.5, ts: new Date(t), source: "drift" as const });
    }
    for (let i = 0; i < drift.length; i += 500) await db.insert(priceHistory).values(drift.slice(i, i + 500));
    const realRows = [];
    for (let t = now - 29 * DAY; t < now - 5 * DAY; t += 3 * DAY) {
      realRows.push({ marketId: id, probability: 0.5, ts: new Date(t), source: "trade" as const });
    }
    await db.insert(priceHistory).values(realRows);

    const tradeRowsBefore = await db
      .select({ n: sql<number>`count(*)` })
      .from(priceHistory)
      .where(eq(priceHistory.source, "trade"));
    const driftBefore = (await rowsFor(id)).filter((r) => r.source === "drift").length;
    assert.ok(driftBefore > 1000, `expected a dense tail, got ${driftBefore} rows`);

    // `thin` is forced here: a run only thins once an hour per process, and earlier
    // tests in this file have already spent that hour
    const run = await runMarketDrift({ thin: true });
    assert.ok(run.thinned > 0, "the thinning pass deleted nothing — the old tail is still there");

    const after = await rowsFor(id);
    const driftAfter = after.filter((r) => r.source === "drift").length;
    assert.ok(driftAfter < driftBefore / 4, `thinned ${driftBefore} rows down to ${driftAfter} — barely anything`);
    const tradeRowsAfter = await db
      .select({ n: sql<number>`count(*)` })
      .from(priceHistory)
      .where(eq(priceHistory.source, "trade"));
    assert.equal(tradeRowsAfter[0].n, tradeRowsBefore[0].n, "the thinning deleted a row a trade wrote");

    // one row survives per six-hour bucket, so the old curve keeps its shape
    const old = after.filter((r) => r.source === "drift" && r.ts.getTime() < now - 4 * DAY);
    const buckets = new Set(old.map((r) => Math.floor(r.ts.getTime() / (6 * HOUR))));
    assert.equal(buckets.size, old.length, "two rows survived in the same bucket");

    // and the chart still ends on the live price
    const series = await getPriceHistory(id);
    const live = await getMarket(id);
    assert.ok(Math.abs(series[series.length - 1].p - live.probability) < 1e-12, "the chart no longer ends on the price");
  });

  await test("a resolved market never drifts, whatever else is true of it", async () => {
    const id = await makeQuietMarket({ p: 0.5 });
    await db.update(markets).set({ status: "resolved", resolution: "YES", probability: 1 }).where(eq(markets.id, id));
    const run = await runMarketDrift({ now: Date.now() + 12 * HOUR });
    assert.ok(!run.steps.some((s) => s.marketId === id), "drifted a settled market");
    assert.equal((await getMarket(id)).probability, 1, "moved a settled price");
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (failures.length) {
    console.error(`\nmarket-drift: ${passed} passed, ${failures.length} FAILED\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`market-drift: ${passed} end-to-end tests passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
