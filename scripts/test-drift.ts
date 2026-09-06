/**
 * Invariant tests for the quiet-market drift (src/lib/drift.ts) — the only thing
 * on the site that moves a real price without a trader, and therefore the thing
 * that has to prove it cannot run away.
 *
 * The four claims under test:
 *   1. bounded    — the quote never leaves `driftBand(anchor)` of the anchor,
 *                   whatever the market, the config or how long it drifts.
 *   2. re-anchored— a real trade re-centres the wander on the traded price.
 *   3. cadence-free — the curve is a function of the wall clock, so running the
 *                   job every 10 minutes or every hour traces the same line.
 *   4. alive      — and it does actually move, which is the whole point.
 *
 * No framework — plain assertions so it runs anywhere `tsx` runs. Run: npm test
 */
import assert from "node:assert/strict";
import {
  DEFAULT_DRIFT_CONFIG,
  DRIFT_HARD_MAX_DEVIATION,
  DRIFT_HARD_MAX_STEP,
  driftBand,
  driftField,
  driftSeed,
  driftTargetAt,
  planDrift,
  type DriftConfig,
  type DriftInput,
} from "../src/lib/drift";
import { initialState, priceYes, stateAtProbability, PRICE_BAND, quoteBuy, positionValue } from "../src/lib/lmsr";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** A spread of real-looking market ids. */
const IDS = [
  "netanyahu-trial-verdict-2026",
  "golan-libel-suit",
  "channel-14-likud-30-seats",
  "draft-law-first-reading",
  "ben-gvir-resigns",
  "election-date-june",
  "gantz-lapid-merger",
  "bennett-runs",
  "smotrich-budget-passes",
  "poll-yesh-atid-under-10",
];

/** The prices AGENT.md asks new questions to open at. */
const ANCHORS = [0.03, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95, 0.97];

const T0 = Date.UTC(2026, 8, 1, 6, 0, 0);

/** A market that is quiet, warm, open and far from its close — everything the policy asks for. */
function quiet(over: Partial<DriftInput> = {}): DriftInput {
  const now = over.now ?? T0;
  return {
    marketId: "netanyahu-trial-verdict-2026",
    status: "open",
    probability: 0.5,
    anchor: 0.5,
    lastTradeAt: now - 3 * DAY,
    lastDriftAt: null,
    opensAt: now - 10 * DAY,
    closesAt: now + 30 * DAY,
    now,
    ...over,
  };
}

/**
 * Runs the policy over a stretch of time, feeding each written price back in as
 * the market's new quote — exactly what `market-drift.ts` does against the
 * database. Returns every quote the market showed.
 */
function simulate(opts: {
  marketId: string;
  anchor: number;
  from?: number;
  days: number;
  stepMs: number;
  cfg?: DriftConfig;
  input?: Partial<DriftInput>;
}): { prices: number[]; ticks: number; maxMove: number } {
  const cfg = opts.cfg ?? DEFAULT_DRIFT_CONFIG;
  let p = opts.from ?? opts.anchor;
  let lastDriftAt: number | null = null;
  const prices = [p];
  let ticks = 0;
  let maxMove = 0;
  for (let t = T0; t < T0 + opts.days * DAY; t += opts.stepMs) {
    const plan = planDrift(
      quiet({
        marketId: opts.marketId,
        anchor: opts.anchor,
        probability: p,
        lastDriftAt,
        now: t,
        lastTradeAt: T0 - 3 * DAY,
        opensAt: T0 - 10 * DAY,
        closesAt: T0 + (opts.days + 30) * DAY,
        ...opts.input,
      }),
      cfg,
    );
    if (!plan.move) continue;
    maxMove = Math.max(maxMove, Math.abs(plan.to - p));
    p = plan.to;
    lastDriftAt = t;
    ticks++;
    prices.push(p);
  }
  return { prices, ticks, maxMove };
}

/* ------------------------------- the band -------------------------------- */

test("the band is never wider than the hard cap, at any anchor or config", () => {
  const greedy: DriftConfig = { ...DEFAULT_DRIFT_CONFIG, maxDeviation: 0.5, relFraction: 5 };
  for (const a of ANCHORS) {
    for (const cfg of [DEFAULT_DRIFT_CONFIG, greedy]) {
      const dev = driftBand(a, cfg);
      assert.ok(dev >= 0, `anchor ${a}: negative band`);
      assert.ok(dev <= DRIFT_HARD_MAX_DEVIATION + 1e-12, `anchor ${a}: band ${dev} above the hard cap`);
    }
  }
});

test("the band shrinks near 0 and 1, so a 3% market is never doubled", () => {
  for (const a of [0.02, 0.03, 0.05, 0.95, 0.97, 0.98]) {
    const dev = driftBand(a);
    assert.ok(dev <= DEFAULT_DRIFT_CONFIG.relFraction * Math.min(a, 1 - a) + 1e-12, `anchor ${a}: ${dev} too wide`);
    assert.ok(dev < Math.min(a, 1 - a), `anchor ${a}: the band reaches past the market's own price`);
  }
  assert.equal(driftBand(0), 0);
  assert.equal(driftBand(1), 0);
  assert.equal(driftBand(Number.NaN), 0);
});

test("the target never leaves the band, over every market, anchor and hour of a month", () => {
  for (const id of IDS) {
    for (const a of ANCHORS) {
      const dev = driftBand(a);
      for (let t = T0; t < T0 + 30 * DAY; t += HOUR) {
        const target = driftTargetAt(id, a, t);
        assert.ok(
          Math.abs(target - a) <= dev + 1e-9,
          `${id} @${a}: target ${target} is ${Math.abs(target - a)} from the anchor, band ${dev}`,
        );
        assert.ok(target > 0 && target < 1, `${id} @${a}: target ${target} left the unit interval`);
        assert.ok(
          target >= DEFAULT_DRIFT_CONFIG.pFloor - 1e-9 && target <= DEFAULT_DRIFT_CONFIG.pCeil + 1e-9,
          `${id} @${a}: target ${target} left [pFloor, pCeil]`,
        );
      }
    }
  }
});

test("the noise itself stays strictly inside (-1, 1)", () => {
  for (const id of IDS) {
    const seed = driftSeed(id);
    for (let t = T0; t < T0 + 10 * DAY; t += 7 * MIN) {
      const f = driftField(seed, t);
      assert.ok(f > -1 && f < 1, `${id}: field ${f} pressed against the clamp`);
    }
  }
});

/* ---------------------------- determinism -------------------------------- */

test("the same market at the same instant always gets the same target", () => {
  for (const id of IDS) {
    for (const t of [T0, T0 + 37 * MIN, T0 + 5 * DAY]) {
      assert.equal(driftTargetAt(id, 0.42, t), driftTargetAt(id, 0.42, t), `${id}: not reproducible`);
    }
  }
});

test("two markets do not move in lockstep", () => {
  const t = T0 + 3 * DAY + 17 * MIN;
  const targets = IDS.map((id) => driftTargetAt(id, 0.5, t));
  assert.ok(new Set(targets).size >= IDS.length - 1, `markets share a target: ${targets.join(", ")}`);
});

test("changing the salt changes every curve — and only the salt does", () => {
  const other: DriftConfig = { ...DEFAULT_DRIFT_CONFIG, seedSalt: "something-else" };
  const t = T0 + 2 * DAY;
  let differ = 0;
  for (const id of IDS) if (driftTargetAt(id, 0.5, t, other) !== driftTargetAt(id, 0.5, t)) differ++;
  assert.ok(differ >= IDS.length - 1, `only ${differ}/${IDS.length} curves moved with the salt`);
});

test("the curve does not depend on how often the job runs", () => {
  // the target is a function of the wall clock, so a 10-minute clock and an hourly
  // clock must agree at every instant they share
  for (const id of IDS) {
    for (let t = T0; t < T0 + 5 * DAY; t += HOUR) {
      assert.equal(driftTargetAt(id, 0.6, t), driftTargetAt(id, 0.6, t), `${id}: cadence leaked into the target`);
    }
  }
  const fine = simulate({ marketId: IDS[0], anchor: 0.6, days: 7, stepMs: 10 * MIN });
  const coarse = simulate({ marketId: IDS[0], anchor: 0.6, days: 7, stepMs: HOUR });
  const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  // the fine clock samples the same curve more densely: same shape, same reach
  assert.ok(
    Math.abs(span(fine.prices) - span(coarse.prices)) < 0.02,
    `10-minute clock spanned ${span(fine.prices)}, hourly clock ${span(coarse.prices)}`,
  );
});

/* ------------------------------ no runaway -------------------------------- */

test("a month of drifting never carries a market out of its band", () => {
  for (const id of IDS) {
    for (const a of ANCHORS) {
      const dev = driftBand(a);
      const { prices } = simulate({ marketId: id, anchor: a, days: 30, stepMs: 10 * MIN });
      for (const p of prices) {
        assert.ok(Math.abs(p - a) <= dev + 1e-9, `${id} @${a}: reached ${p}, band ${dev}`);
        assert.ok(p >= PRICE_BAND.min && p <= PRICE_BAND.max, `${id} @${a}: ${p} left the trading band`);
      }
    }
  }
});

test("no single tick is a jump, and no tick is written for nothing", () => {
  for (const id of IDS) {
    const cfg = DEFAULT_DRIFT_CONFIG;
    let p = 0.5;
    let lastDriftAt: number | null = null;
    for (let t = T0; t < T0 + 14 * DAY; t += 10 * MIN) {
      const plan = planDrift(quiet({ marketId: id, probability: p, lastDriftAt, now: t }), cfg);
      if (!plan.move) continue;
      const move = Math.abs(plan.to - p);
      assert.ok(move <= cfg.maxStep + 1e-9, `${id}: a ${(move * 100).toFixed(2)}pt tick`);
      assert.ok(move >= cfg.minStep - 1e-9, `${id}: a ${(move * 100).toFixed(3)}pt tick was written anyway`);
      p = plan.to;
      lastDriftAt = t;
    }
  }
});

test("the quote is pulled back to the anchor rather than wandering off it", () => {
  // the mean of a long quiet stretch sits on the traded price, because the target is
  // the anchor plus zero-mean noise and never a step off the current price
  for (const a of [0.2, 0.5, 0.8]) {
    for (const id of IDS) {
      const { prices } = simulate({ marketId: id, anchor: a, days: 30, stepMs: 20 * MIN });
      const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
      assert.ok(Math.abs(mean - a) <= driftBand(a) * 0.9, `${id} @${a}: settled around ${mean.toFixed(4)}`);
    }
  }
});

test("a quote that starts outside the band is walked back in, not pinned", () => {
  const a = 0.5;
  const dev = driftBand(a);
  const { prices } = simulate({ marketId: IDS[0], anchor: a, from: a + 0.2, days: 5, stepMs: 10 * MIN });
  assert.ok(prices[prices.length - 1] <= a + dev + 1e-9, `still at ${prices[prices.length - 1]} after five days`);
  for (let i = 1; i < prices.length; i++) {
    assert.ok(Math.abs(prices[i] - prices[i - 1]) <= DEFAULT_DRIFT_CONFIG.maxStep + 1e-9, "walked back in one jump");
  }
});

test("a trade re-centres the whole wander on the traded price", () => {
  const id = IDS[2];
  const traded = 0.72; // somebody just moved it here from 0.5
  const dev = driftBand(traded);
  for (let t = T0; t < T0 + 20 * DAY; t += HOUR) {
    assert.ok(Math.abs(driftTargetAt(id, traded, t) - traded) <= dev + 1e-9, "the wander ignored the new anchor");
  }
  const { prices } = simulate({ marketId: id, anchor: traded, from: traded, days: 20, stepMs: 30 * MIN });
  for (const p of prices) assert.ok(Math.abs(p - traded) <= dev + 1e-9, `drifted to ${p} away from the traded ${traded}`);
});

/* -------------------------------- alive ---------------------------------- */

test("a quiet market actually moves — that is the whole point", () => {
  for (const id of IDS) {
    const { prices, ticks } = simulate({ marketId: id, anchor: 0.5, days: 7, stepMs: 10 * MIN });
    const span = Math.max(...prices) - Math.min(...prices);
    assert.ok(ticks >= 40, `${id}: only ${ticks} ticks in a week`);
    assert.ok(span >= 0.015, `${id}: a week of drift spanned ${(span * 100).toFixed(2)}pt — still reads as frozen`);
  }
});

test("a market at 5% moves too, just proportionally less", () => {
  for (const id of IDS.slice(0, 5)) {
    const { prices } = simulate({ marketId: id, anchor: 0.05, days: 7, stepMs: 10 * MIN });
    const span = Math.max(...prices) - Math.min(...prices);
    assert.ok(span > 0.004, `${id}: a 5% market spanned ${(span * 100).toFixed(2)}pt`);
    assert.ok(span <= 2 * driftBand(0.05) + 1e-9, `${id}: spanned ${span}, wider than its own band`);
  }
});

/* -------------------------------- the gates ------------------------------- */

test("every gate fails closed, and names itself", () => {
  const cases: [string, Partial<DriftInput>][] = [
    ["not-open", { status: "resolved" }],
    ["not-open", { status: "cancelled" }],
    ["closed", { closesAt: T0 - HOUR }],
    ["closing-soon", { closesAt: T0 + HOUR }],
    ["warming-up", { opensAt: T0 - 10 * MIN }],
    ["traded-recently", { lastTradeAt: T0 - HOUR }],
    ["too-soon", { lastDriftAt: T0 - MIN }],
    ["bad-input", { probability: 0 }],
    ["bad-input", { probability: 1 }],
    ["bad-input", { anchor: Number.NaN }],
    ["bad-input", { now: Number.NaN }],
  ];
  for (const [reason, over] of cases) {
    const plan = planDrift(quiet(over));
    assert.equal(plan.move, false, `${reason}: moved anyway (${JSON.stringify(over)})`);
    assert.equal(plan.move === false && plan.reason, reason, `wrong reason for ${JSON.stringify(over)}`);
  }
});

test("MARKET_DRIFT=off stops everything", () => {
  const plan = planDrift(quiet(), { ...DEFAULT_DRIFT_CONFIG, enabled: false });
  assert.equal(plan.move, false);
  assert.equal(plan.move === false && plan.reason, "disabled");
});

test("a market with real answers on it is left alone for a full quiet window", () => {
  for (let h = 0; h < DEFAULT_DRIFT_CONFIG.quietMs / HOUR; h++) {
    const plan = planDrift(quiet({ lastTradeAt: T0 - h * HOUR }));
    assert.equal(plan.move, false, `moved ${h}h after a trade`);
  }
  assert.equal(planDrift(quiet({ lastTradeAt: T0 - 7 * HOUR })).move, true, "never woke up after the quiet window");
});

test("no config can widen a step past the hard cap", () => {
  const greedy: DriftConfig = { ...DEFAULT_DRIFT_CONFIG, maxStep: 1, maxDeviation: DRIFT_HARD_MAX_DEVIATION };
  for (const id of IDS) {
    const plan = planDrift(quiet({ marketId: id, probability: 0.5, anchor: 0.5 }), greedy);
    if (!plan.move) continue;
    assert.ok(Math.abs(plan.to - 0.5) <= DRIFT_HARD_MAX_STEP + 1e-9, `${id}: ${plan.to} is more than one hard step`);
  }
});

test("a market with no room to move says so instead of moving", () => {
  // priced outside [pFloor, pCeil]: there is no small move to make at 0.5%, so none is made
  for (const a of [0.005, 0.01, 0.019, 0.981, 0.995]) {
    const plan = planDrift(quiet({ probability: a, anchor: a }));
    assert.equal(plan.move, false, `anchor ${a} drifted`);
    assert.equal(plan.move === false && plan.reason, "no-room", `anchor ${a}`);
  }
  const flat = planDrift(quiet(), { ...DEFAULT_DRIFT_CONFIG, maxDeviation: 0 });
  assert.equal(flat.move, false);
  assert.equal(flat.move === false && flat.reason, "no-room");
});

/* ------------------------- the write it turns into ------------------------ */

test("stateAtProbability lands exactly on the asked price and touches one leg only", () => {
  for (const b of [500, 1000, 2000, 4000, 8000]) {
    for (const p0 of ANCHORS) {
      const state = initialState(p0, b);
      for (const target of [0.02, 0.1, 0.5, 0.9, 0.98]) {
        const moved = stateAtProbability(state, target);
        assert.ok(Math.abs(priceYes(moved) - target) < 1e-12, `b=${b} ${p0}→${target}: landed on ${priceYes(moved)}`);
        assert.equal(moved.qNo, state.qNo, "the NO leg moved");
        assert.equal(moved.b, state.b, "the liquidity moved");
      }
    }
  }
});

test("a nudge never parks the book where buying is refused", () => {
  for (const b of [500, 2000, 8000]) {
    for (const p of [DEFAULT_DRIFT_CONFIG.pFloor, 0.5, DEFAULT_DRIFT_CONFIG.pCeil]) {
      const moved = stateAtProbability(initialState(0.5, b), p);
      const price = priceYes(moved);
      assert.ok(price >= PRICE_BAND.min && price <= PRICE_BAND.max, `b=${b}: parked at ${price}`);
      assert.ok(quoteBuy(moved, "YES", 100).shares > 0, `b=${b}: a ₪100 bet stopped working after a nudge`);
      assert.ok(quoteBuy(moved, "NO", 100).shares > 0, `b=${b}: a ₪100 bet stopped working after a nudge`);
    }
  }
});

test("what a full day of drift can do to an open position is small and bounded", () => {
  // a ₪100 position on a market that then goes quiet for a day: the drift may move
  // what it is worth, but only by about what the band allows — never by a multiple
  const b = 2000;
  const state = initialState(0.5, b);
  const bought = quoteBuy(state, "YES", 100);
  const after = { ...state, qYes: state.qYes + bought.shares };
  const start = positionValue(after, "YES", bought.shares);
  const dev = driftBand(priceYes(after));
  let worst = 0;
  for (const id of IDS) {
    for (let t = T0; t < T0 + DAY; t += 10 * MIN) {
      const p = driftTargetAt(id, priceYes(after), t);
      worst = Math.max(worst, Math.abs(positionValue(stateAtProbability(after, p), "YES", bought.shares) - start));
    }
  }
  assert.ok(worst <= bought.shares * dev * 1.05, `a quiet day moved ₪100 by ₪${worst.toFixed(2)}`);
  assert.ok(worst < 10, `a quiet day moved ₪100 by ₪${worst.toFixed(2)} — that is news, not drift`);
});

console.log(`drift: ${passed} tests passed`);
