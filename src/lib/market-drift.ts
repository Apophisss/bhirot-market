/**
 * The runner behind `src/lib/drift.ts`: it finds the markets nobody has answered
 * in hours and walks their LMSR quote to the price the drift policy asks for.
 *
 * Server-only. This is the only place a price moves without a trader, and it is
 * deliberately a small, boring writer:
 *
 *  - the decision is not taken here. `planDrift` decides; this file supplies the
 *    facts (the anchor, the last trade, the last tick) and applies the answer.
 *  - only `markets.qYes`, `markets.probability` and one `price_history` row move.
 *    `volume` and `tradeCount` are the count of things people did, and nothing
 *    here did anything, so they are left exactly alone — as are balances,
 *    positions, the leaderboard and `updatedAt` (which is content freshness).
 *  - the write re-reads the market inside the transaction and gives up if anyone
 *    traded in the meantime. A real answer always beats a nudge.
 */
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { priceYes, stateAtProbability } from "./lmsr";
import { isBusyError } from "./trade";
import {
  DEFAULT_DRIFT_CONFIG,
  DRIFT_HARD_MAX_DEVIATION,
  DRIFT_HARD_MAX_STEP,
  planDrift,
  type DriftConfig,
  type DriftSkipReason,
} from "./drift";

const { markets, trades, priceHistory } = schema;

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Drift rows older than this are thinned to one per `THIN_BUCKET_MS`.
 *
 * A quiet market takes a tick every half hour or so, which is the right density for
 * "what has this market done today" and far more than a chart of the last two months
 * can draw. Left alone it would also grow `price_history` without bound for a board
 * that runs until election day. Thinning keeps the recent curve at full resolution
 * and the old one at its shape.
 *
 * Rows written by a trade, an opening price or a settlement are NEVER touched: that
 * is the audit trail behind somebody's money, and it is not ours to compress.
 */
const THIN_AFTER_MS = 3 * DAY;
const THIN_BUCKET_MS = 6 * HOUR;

/**
 * ...and past this age a drift row is deleted outright rather than thinned.
 *
 * Thinning bounds the density of the old tail but not its length: a board that runs
 * until election day would still keep a tick every six hours per market forever, and
 * every one of them is a row the drift queries below and the deck's curves have to
 * step over. Nothing draws them — the chart window is thirty days
 * (`SYNTHETIC_HISTORY_WINDOW_DAYS`) and `getPriceHistoryMany` reads thirty-one — so
 * two weeks past the furthest thing that can be drawn, a house tick has no reader left.
 *
 * As with the thinning, `source = 'drift'` is the whole point: the opening price, every
 * trade and every settlement are the audit trail behind somebody's score, they are what
 * `history` in `/api/markets/<slug>` publishes, and they are kept forever.
 */
const PRUNE_AFTER_MS = 45 * DAY;

/**
 * ...and at most once an hour per process. The statement scans every drift row older
 * than the cutoff, which is cheap but not free, and there is nothing for it to do on
 * the other five passes of the hour: the rows it would delete are ones written days
 * ago. A restart simply thins once more than it had to.
 */
const THIN_EVERY_MS = HOUR;
let thinnedAt = 0;

/** Parse-and-clamp: a bad value falls back to the default, a large one is capped. No env var can widen a bound. */
function numEnv(raw: string | undefined, fallback: number, lo: number, hi: number): number {
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/**
 * The knobs, read from the environment. Every one of them is clamped into the
 * bounds `drift.ts` declares, so a typo in `.env` can slow the drift down or stop
 * it, but never widen it past what the module guarantees.
 *
 * Takes the environment as an argument so the wiring itself is testable —
 * `scripts/test-market-drift.ts` reads the table rather than the running process.
 */
export function driftConfigFrom(env: Record<string, string | undefined>): DriftConfig {
  return {
    ...DEFAULT_DRIFT_CONFIG,
    enabled: env.MARKET_DRIFT !== "off",
    maxDeviation: numEnv(env.MARKET_DRIFT_MAX_DEV, DEFAULT_DRIFT_CONFIG.maxDeviation, 0, DRIFT_HARD_MAX_DEVIATION),
    maxStep: numEnv(env.MARKET_DRIFT_MAX_STEP, DEFAULT_DRIFT_CONFIG.maxStep, 0, DRIFT_HARD_MAX_STEP),
    quietMs: numEnv(env.MARKET_DRIFT_QUIET_HOURS, DEFAULT_DRIFT_CONFIG.quietMs / HOUR, 0.25, 240) * HOUR,
    seedSalt: env.MARKET_DRIFT_SALT || DEFAULT_DRIFT_CONFIG.seedSalt,
  };
}

/** Resolved once per server instance — the env does not change under a running process. */
let cached: DriftConfig | null = null;
export function driftConfig(): DriftConfig {
  if (!cached) cached = driftConfigFrom(process.env);
  return cached;
}

/**
 * At most this many markets move in one run, so a long-idle board cannot turn into
 * one huge write burst. Comfortably above the number of quiet markets a full board
 * has, so in practice every one of them gets its turn on every pass; the cap is the
 * ceiling for the day the board is much bigger, and the "quietest first" ordering
 * below is what keeps the overflow fair.
 */
const MAX_PER_RUN = 150;

export interface DriftStep {
  marketId: string;
  from: number;
  to: number;
  /** signed move, in percentage points — the number a human reads in the log */
  deltaPp: number;
  anchor: number;
}

export interface DriftRun {
  ok: true;
  /** open, tradable markets considered */
  scanned: number;
  moved: number;
  /** why the rest were left alone, by reason */
  skipped: Partial<Record<DriftSkipReason | "raced" | "failed", number>>;
  steps: DriftStep[];
  /** old drift rows dropped by the thinning pass */
  thinned: number;
  /** drift rows past `PRUNE_AFTER_MS` deleted outright by the same pass */
  pruned: number;
  dryRun: boolean;
  ms: number;
}

async function withBusyRetry<T>(run: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= retries || !isBusyError(err)) throw err;
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt + Math.random() * 25));
    }
  }
}

/**
 * One pass over the board.
 *
 * Called by `/api/cron/drift` (a short clock, so the movement is visible inside a
 * single visit) and once more by the hourly `/api/cron/refresh`, which is the
 * safety net for a deployment with no second clock. Running it twice in the same
 * minute is harmless: the second pass skips everything on `minIntervalMs`, and
 * the drift target is a function of the wall clock rather than of how often the
 * job runs, so the cadence changes how finely the curve is sampled and nothing else.
 */
export async function runMarketDrift(
  opts: { now?: number; dryRun?: boolean; limit?: number; config?: DriftConfig; thin?: boolean } = {},
): Promise<DriftRun> {
  const started = Date.now();
  const now = opts.now ?? started;
  const dryRun = opts.dryRun ?? false;
  const limit = Math.max(0, opts.limit ?? MAX_PER_RUN);
  const cfg = opts.config ?? driftConfig();
  const skipped: DriftRun["skipped"] = {};
  const note = (reason: DriftSkipReason | "raced" | "failed") => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  if (!cfg.enabled) {
    return { ok: true, scanned: 0, moved: 0, skipped: { disabled: 1 }, steps: [], thinned: 0, pruned: 0, dryRun, ms: 0 };
  }

  const db = await getDb();
  const open = await db
    .select()
    .from(markets)
    .where(and(eq(markets.status, "open"), gt(markets.closesAt, new Date(now))));
  if (!open.length) {
    return { ok: true, scanned: 0, moved: 0, skipped, steps: [], thinned: 0, pruned: 0, dryRun, ms: Date.now() - started };
  }

  /* -- the three facts the policy needs, in three round trips rather than 3×N -- */

  // the price the last REAL move left behind: the newest non-drift row of each market.
  // `max(id)` rather than `max(ts)` because ids are monotonic and two rows can share a timestamp.
  const anchorRows = await db
    .select({ marketId: priceHistory.marketId, probability: priceHistory.probability, ts: priceHistory.ts })
    .from(priceHistory)
    .where(sql`${priceHistory.id} in (select max(id) from price_history where source <> 'drift' group by marketId)`);
  const anchors = new Map(anchorRows.map((r) => [r.marketId, { p: r.probability, t: r.ts.getTime() }]));

  const driftRows = await db
    .select({ marketId: priceHistory.marketId, ts: sql<number>`max(${priceHistory.ts})` })
    .from(priceHistory)
    .where(eq(priceHistory.source, "drift"))
    .groupBy(priceHistory.marketId);
  const lastDrift = new Map(driftRows.map((r) => [r.marketId, Number(r.ts)]));

  // the anchor row already dates the last trade, but only for markets that have one;
  // this covers a settled-then-reopened edge and keeps "quiet" measured off the trade table itself
  const tradeRows = await db
    .select({ marketId: trades.marketId, ts: sql<number>`max(${trades.createdAt})` })
    .from(trades)
    .groupBy(trades.marketId);
  const lastTrade = new Map(tradeRows.map((r) => [r.marketId, Number(r.ts)]));

  /* -- plan every market, then move the most overdue ones ------------------- */

  const planned: { row: (typeof open)[number]; to: number; from: number; anchor: number; lastMove: number }[] = [];
  for (const m of open) {
    const anchor = anchors.get(m.id);
    const lastMove = Math.max(anchor?.t ?? 0, lastDrift.get(m.id) ?? 0, m.createdAt.getTime());
    const plan = planDrift(
      {
        marketId: m.id,
        status: m.status,
        probability: m.probability,
        // a market with no price row at all is quoted where it opened
        anchor: anchor?.p ?? m.probability,
        lastTradeAt: lastTrade.get(m.id) ?? anchor?.t ?? m.createdAt.getTime(),
        lastDriftAt: lastDrift.get(m.id) ?? null,
        opensAt: m.createdAt.getTime(),
        closesAt: m.closesAt.getTime(),
        now,
      },
      cfg,
    );
    if (!plan.move) {
      note(plan.reason);
      continue;
    }
    planned.push({ row: m, to: plan.to, from: plan.from, anchor: plan.anchor, lastMove });
  }
  // the quietest first, so a board with more candidates than the cap still gives every
  // market its turn instead of moving the same head of the list on every run
  planned.sort((a, b) => a.lastMove - b.lastMove);

  const steps: DriftStep[] = [];
  for (const p of planned.slice(0, limit)) {
    if (dryRun) {
      steps.push({ marketId: p.row.id, from: p.from, to: p.to, deltaPp: (p.to - p.from) * 100, anchor: p.anchor });
      continue;
    }
    try {
      const applied = await withBusyRetry(() => applyDrift(p.row.id, p.from, p.to, now));
      if (applied) steps.push({ ...applied, anchor: p.anchor });
      else note("raced");
    } catch (err) {
      console.error("[drift] failed", p.row.id, err);
      note("failed");
    }
  }

  const thin = opts.thin ?? (!dryRun && now - thinnedAt >= THIN_EVERY_MS);
  const thinned = thin
    ? await thinDriftHistory(now).catch((err) => {
        console.error("[drift] thinning failed", err);
        return 0;
      })
    : 0;
  // the prune rides on the same hourly gate as the thinning, and runs after it: the
  // thinning has already emptied most of what the prune would have had to walk
  const pruned = thin
    ? await pruneDriftHistory(now).catch((err) => {
        console.error("[drift] pruning failed", err);
        return 0;
      })
    : 0;

  return {
    ok: true,
    scanned: open.length,
    moved: steps.length,
    skipped,
    steps,
    thinned,
    pruned,
    dryRun,
    ms: Date.now() - started,
  };
}

/**
 * Writes one tick, or nothing.
 *
 * `expectedFrom` is the guard: the plan was computed against a quote, and if the
 * market is no longer at that quote then somebody traded between the read and
 * the write. Their price is the real one, so the tick is dropped rather than
 * layered on top of it — the next run will re-plan around the new anchor.
 */
async function applyDrift(
  marketId: string,
  expectedFrom: number,
  to: number,
  now: number,
): Promise<Omit<DriftStep, "anchor"> | null> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const m = await tx.query.markets.findFirst({ where: eq(markets.id, marketId) });
    if (!m || m.status !== "open" || m.closesAt.getTime() <= now) return null;
    if (Math.abs(m.probability - expectedFrom) > 1e-9) return null;

    const state = stateAtProbability({ qYes: m.qYes, qNo: m.qNo, b: m.liquidity }, to);
    // the written probability is read back out of the state rather than trusted from
    // the plan, so `markets.probability` and the LMSR book can never disagree
    const p = priceYes(state);
    if (!(p > 0 && p < 1)) return null;

    await tx.update(markets).set({ qYes: state.qYes, probability: p }).where(eq(markets.id, marketId));
    await tx.insert(priceHistory).values({ marketId, probability: p, ts: new Date(now), source: "drift" });
    return { marketId, from: expectedFrom, to: p, deltaPp: (p - expectedFrom) * 100 };
  });
}

/**
 * Compresses the old tail of the drift history: past `THIN_AFTER_MS`, one drift row
 * survives per market per `THIN_BUCKET_MS` bucket and the rest are dropped. The chart
 * keeps the shape of the old curve and loses only detail nobody can see at that zoom.
 *
 * `source = 'drift'` appears in both halves of the statement on purpose — this must
 * never be able to delete a row a trade wrote, whatever else is in the table.
 *
 * The `cast(... as integer)` is not decoration: a bound JavaScript number arrives as a
 * float, and `ts / 21600000.0` is a float division, which puts every single row in a
 * bucket of its own and quietly thins nothing at all.
 */
async function thinDriftHistory(now: number): Promise<number> {
  const db = await getDb();
  thinnedAt = now;
  const cutoff = now - THIN_AFTER_MS;
  const res = await db.run(sql`
    delete from price_history
    where source = 'drift'
      and ts < ${cutoff}
      and id not in (
        select min(id) from price_history
        where source = 'drift' and ts < ${cutoff}
        group by marketId, cast(ts / ${THIN_BUCKET_MS} as integer)
      )`);
  return Number(res.rowsAffected ?? 0);
}

/**
 * Deletes the drift tail past `PRUNE_AFTER_MS` outright.
 *
 * The thinning above keeps the shape of the old curve; this drops the part of it that
 * is older than anything the site can draw. `source = 'drift'` is again the whole
 * statement's guard — an opening price, a trade or a settlement is never eligible,
 * however old it is.
 */
async function pruneDriftHistory(now: number): Promise<number> {
  const db = await getDb();
  const cutoff = now - PRUNE_AFTER_MS;
  const res = await db.run(sql`delete from price_history where source = 'drift' and ts < ${cutoff}`);
  return Number(res.rowsAffected ?? 0);
}
