/**
 * Property-checks the display-only synthetic price history.
 *
 * The whole promise of src/lib/synthetic-history.ts is a bound — "the drawn line
 * never differs from the recorded price by more than X" — and a repo with no test
 * runner has no other way to keep that promise honest. Run it before committing:
 *
 *   npm run history:verify                  # 28 real fixtures + 20,000 random cases
 *   npm run history:verify -- --cases=200000 --seed=7
 *   npm run history:verify -- --sparklines  # eyeball the actual curves
 *
 * Exits 1 on the first violation and prints the failing case as pasteable JSON.
 */
import fs from "node:fs";
import {
  buildDisplayHistory,
  DEFAULT_SYNTH_CONFIG,
  SYNTH_HARD_MAX_DEVIATION,
  effectiveDeviation,
  type DisplayHistory,
  type DisplayPoint,
  type RealPoint,
  type SynthConfig,
  type SynthInput,
} from "../src/lib/synthetic-history";
import { MarketsFileSchema } from "../src/lib/content";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const EPS = 1e-12;

const argv = process.argv.slice(2);
const arg = (name: string, fallback: number) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
};
const CASES = arg("cases", 20_000);
const SEED = arg("seed", 1);
const SPARKLINES = argv.includes("--sparklines");

/** Fixed clock, derived from the fixtures themselves: nothing here may read the real one. */
let NOW = Date.parse("2026-09-04T22:30:00+03:00");

let failures = 0;
let checks = 0;
let worstRatio = 0;
let worstCase = "";

function fail(invariant: string, label: string, detail: unknown): never {
  console.error(`\n✗ ${invariant} — ${label}`);
  console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}
function check(cond: boolean, invariant: string, label: string, detail: unknown): void {
  checks++;
  if (!cond) {
    failures++;
    fail(invariant, label, detail);
  }
}

/* ------------------------------- harness rng ------------------------------ */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

/* --------------------- independent reference implementation --------------- */

/** Naive O(n·m) LOCF anchor, written here on purpose: a bug in the module's
 *  two-pointer walk must be caught, not mirrored. */
function refAnchor(anchors: RealPoint[], t: number): number {
  let best = anchors[0].p;
  for (const a of anchors) if (a.t <= t) best = a.p;
  return best;
}

/** The anchor set the module is expected to measure itself against. */
function refAnchors(input: SynthInput, cfg: SynthConfig): RealPoint[] {
  const clean: RealPoint[] = [];
  for (const r of [...input.real].filter((r) => Number.isFinite(r.t) && Number.isFinite(r.p)).sort((a, b) => a.t - b.t)) {
    const p = Math.min(1, Math.max(0, r.p));
    if (clean.length && clean[clean.length - 1].t === r.t) clean[clean.length - 1] = { t: r.t, p };
    else clean.push({ t: r.t, p });
  }
  const tEnd = Math.max(Math.floor(input.now / cfg.clockStepMs) * cfg.clockStepMs, clean[clean.length - 1].t);
  const anchors = clean.slice();
  if (tEnd > anchors[anchors.length - 1].t) anchors.push({ t: tEnd, p: input.probability });
  return anchors;
}

/* -------------------------------- invariants ------------------------------ */

function checkSeries(label: string, input: SynthInput, cfg: SynthConfig, r: DisplayHistory): void {
  const pts = r.points;
  check(pts.length > 0, "V6 WELL-FORMED", label, { reason: r.reason }); // PriceChart reads data[0] unconditionally

  // real points, verbatim and unflagged
  const realByT = new Map<number, number>();
  for (const x of [...input.real].sort((a, b) => a.t - b.t)) realByT.set(x.t, Math.min(1, Math.max(0, x.p)));

  let prev = -Infinity;
  for (const q of pts) {
    check(Number.isFinite(q.t) && Number.isFinite(q.p), "V6 WELL-FORMED", label, q);
    check(q.t > prev, "V6 MONOTONIC", label, { q, prev });
    check(!Object.is(q.p, -0), "V6 WELL-FORMED", label, q);
    check(q.p >= 0 && q.p <= 1, "V3 RANGE", label, q);
    prev = q.t;
    const realP = realByT.get(q.t);
    if (realP !== undefined && !q.synthetic) check(q.p === realP, "V5 ANCHORS VERBATIM", label, { q, realP });
    if (realP !== undefined) check(!q.synthetic, "V5 ANCHORS VERBATIM", label, q);
  }
  for (const [t, p] of realByT) {
    const hit = pts.find((q) => q.t === t);
    check(hit !== undefined && hit.p === p, "V5 NO REAL POINT DROPPED", label, { t, p, hit });
  }

  if (!r.synthetic) return; // gated: the passthrough equality is checked by the caller

  const anchors = refAnchors(input, cfg);
  const tEnd = anchors[anchors.length - 1].t;

  for (const q of pts) {
    if (!q.synthetic) continue;
    const a = refAnchor(anchors, q.t);
    const cap = effectiveDeviation(a, cfg);
    const d = Math.abs(q.p - a);
    check(d <= cap + EPS, "V1 BOUND", label, { q, anchor: a, cap, deviation: d });
    check(d <= SYNTH_HARD_MAX_DEVIATION + EPS, "V12 HARD CEILING", label, { q, anchor: a, deviation: d });
    check(d <= cfg.relFraction * Math.min(a, 1 - a) + EPS, "V13 EXTREME SHRINK", label, { q, anchor: a, deviation: d });
    // the cosmetic floor/ceiling applies only where it does not fight the anchor:
    // a real price outside it is truth, and truth always wins
    check(q.p >= Math.min(cfg.pFloor, a) - EPS && q.p <= Math.max(cfg.pCeil, a) + EPS, "V3 RANGE", label, q);
    if (cap > 0) {
      const ratio = d / cap;
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worstCase = label;
      }
    }
  }

  // the drawn curve, not only the samples: within one anchor segment the band is a
  // fixed interval, so any chord between two in-band nodes is in band. Chords that
  // straddle a real point must be ≤ 1 ms wide so the jump is sub-pixel.
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const sameSegment = refAnchor(anchors, A.t) === refAnchor(anchors, B.t);
    if (sameSegment) {
      const a = refAnchor(anchors, B.t);
      const mid = (A.p + B.p) / 2;
      const cap = effectiveDeviation(a, cfg);
      const bothSynthetic = A.synthetic && B.synthetic;
      if (bothSynthetic) check(Math.abs(mid - a) <= cap + EPS, "V2 CHORD", label, { A, B, anchor: a, cap });
      check(Math.abs(B.p - A.p) <= 2 * cap + EPS, "V15 SMOOTHNESS", label, { A, B, cap });
    } else {
      // The chord crosses a real price change. Two real points joined directly is
      // the chart's own pre-existing behaviour and introduces nothing; but a
      // fabricated point must hand over to the real one within 1 ms, so the jump
      // is sub-pixel instead of a full grid step of invented slope.
      check(realByT.has(B.t) || B.t === tEnd, "V2 CHORD/STEP", label, { A, B });
      if (A.synthetic) check(B.t - A.t <= 1, "V2 CHORD/STEP", label, { A, B });
    }
  }

  const last = pts[pts.length - 1];
  check(Object.is(last.p, input.probability), "V4 EXACT TAIL", label, { last, probability: input.probability });
  check(last.t === tEnd, "V4 EXACT TAIL", label, { last, tEnd });
  check(last.synthetic !== true, "V4 EXACT TAIL", label, last);
  check(pts.every((q) => q.t <= tEnd), "V6 WELL-FORMED", label, { tEnd });

  // the array crosses the RSC boundary
  const round = JSON.parse(JSON.stringify(pts)) as DisplayPoint[];
  check(JSON.stringify(round) === JSON.stringify(pts), "V17 JSON ROUND-TRIP", label, { first: pts[0] });
}

function sameSeries(a: DisplayPoint[], b: DisplayPoint[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* --------------------------------- fixtures ------------------------------- */

const file = MarketsFileSchema.parse(JSON.parse(fs.readFileSync("data/markets.json", "utf8")));
// an hour after the newest market was written, so every fixture is already open
NOW = Math.max(NOW, ...file.markets.map((m) => Date.parse(m.createdAt))) + HOUR;
const fixtures: SynthInput[] = file.markets.map((m) => ({
  marketId: m.slug,
  real: [{ t: Date.parse(m.createdAt), p: m.initialProbability }],
  probability: m.initialProbability,
  closesAt: Date.parse(m.closesAt),
  status: m.status,
  tradeCount: 0,
  now: NOW,
}));
/** the fixtures a live site would actually draw an estimate for */
const liveFixtures = fixtures.filter((f) => f.status === "open" && f.closesAt > f.now);

/* ---------------------------------- run ----------------------------------- */

const cfg = DEFAULT_SYNTH_CONFIG;
console.log(`synthetic-history verify — ${fixtures.length} fixtures + ${CASES} random cases (seed ${SEED})`);

const t0 = performance.now();
for (const f of fixtures) {
  const r = buildDisplayHistory(f, cfg);
  checkSeries(f.marketId, f, cfg, r);
  if (f.status !== "open" || f.closesAt <= f.now) {
    // resolved, cancelled or already closed: the estimate must be gated off entirely
    check(!r.synthetic, "V14 GATES", f.marketId, { reason: r.reason });
    continue;
  }
  check(r.synthetic, "V0 FIXTURES SYNTHESIZE", f.marketId, { reason: r.reason });

  // V16 PLAUSIBILITY — a bound so tight the chart is flat again is a failure too
  const syn = r.points.filter((q) => q.synthetic).map((q) => q.p);
  const mean = syn.reduce((s, x) => s + x, 0) / syn.length;
  const sd = Math.sqrt(syn.reduce((s, x) => s + (x - mean) ** 2, 0) / syn.length);
  let extrema = 0;
  for (let i = 1; i < syn.length - 1; i++) {
    if ((syn[i] - syn[i - 1]) * (syn[i + 1] - syn[i]) < 0) extrema++;
  }
  check(sd > 0.12 * r.maxDeviation, "V16 PLAUSIBILITY (flat)", f.marketId, { sd, cap: r.maxDeviation });
  check(extrema >= 4, "V16 PLAUSIBILITY (extrema)", f.marketId, { extrema });
}
const fixtureMs = performance.now() - t0;
check(fixtureMs < 1000, "V19 BUDGET", "fixtures", { fixtureMs });

/* V7 DETERMINISM, V8 IMMUTABLE PAST, V9 PURITY, V10 OFF, V11 ZERO, V14 GATES */

const f0 = liveFixtures[0];
check(sameSeries(buildDisplayHistory(f0, cfg).points, buildDisplayHistory(f0, cfg).points), "V7 DETERMINISM", f0.marketId, {});
{
  const shuffled: SynthInput = { ...f0, real: [...f0.real].reverse() };
  check(sameSeries(buildDisplayHistory(shuffled, cfg).points, buildDisplayHistory(f0, cfg).points), "V7 DETERMINISM (input order)", f0.marketId, {});
}
for (const f of liveFixtures) {
  const base = buildDisplayHistory(f, cfg).points;
  for (const jitter of [1, 7 * MIN, cfg.clockStepMs - 1]) {
    const j = buildDisplayHistory({ ...f, now: f.now + jitter }, cfg).points;
    if (Math.floor((f.now + jitter) / cfg.clockStepMs) === Math.floor(f.now / cfg.clockStepMs)) {
      check(sameSeries(base, j), "V7 DETERMINISM (clock bucket)", f.marketId, { jitter });
    }
  }
  // V8: the fabricated past must not rewrite itself as the clock advances
  const baseEnd = base[base.length - 1].t;
  for (let k = 1; k <= 24; k++) {
    const later = buildDisplayHistory({ ...f, now: f.now + k * cfg.clockStepMs }, cfg).points;
    const byT = new Map(later.map((q) => [q.t, q.p]));
    for (const q of base) {
      if (q.t > baseEnd - cfg.pinMs) continue;
      const then = byT.get(q.t);
      if (then !== undefined) check(then === q.p, "V8 IMMUTABLE PAST", f.marketId, { t: q.t, was: q.p, now: then, k });
    }
  }
}

{
  const realRandom = Math.random;
  const realNow = Date.now;
  try {
    Math.random = () => {
      throw new Error("synthetic-history must not use Math.random");
    };
    Date.now = () => {
      throw new Error("synthetic-history must not read the clock");
    };
    for (const f of fixtures) buildDisplayHistory(f, cfg);
    checks++;
  } catch (err) {
    failures++;
    fail("V9 PURITY", "generator touched the clock or the RNG", String(err));
  } finally {
    Math.random = realRandom;
    Date.now = realNow;
  }
}

for (const f of liveFixtures.slice(0, 4)) {
  const off = buildDisplayHistory(f, { ...cfg, enabled: false });
  check(!off.synthetic && off.points.length === f.real.length, "V10 OFF SWITCH", f.marketId, off);
  check(off.points.every((q, i) => q.t === f.real[i].t && q.p === f.real[i].p), "V10 OFF SWITCH", f.marketId, off.points);

  const zero = buildDisplayHistory(f, { ...cfg, maxDeviation: 0 });
  const anchors = refAnchors(f, cfg);
  for (const q of zero.points) {
    if (q.synthetic) check(q.p === refAnchor(anchors, q.t), "V11 ZERO BOUND", f.marketId, q);
  }

  const wide = buildDisplayHistory(f, { ...cfg, maxDeviation: 9 });
  for (const q of wide.points) {
    if (!q.synthetic) continue;
    const a = refAnchor(anchors, q.t);
    check(Math.abs(q.p - a) <= SYNTH_HARD_MAX_DEVIATION + EPS, "V12 HARD CEILING", f.marketId, { q, a });
  }

  const prefixOnly = buildDisplayHistory(f, { ...cfg, fillGaps: false });
  const opens = f.real[0].t;
  for (const q of prefixOnly.points) {
    if (q.synthetic) check(q.t < opens, "V14 PREFIX-ONLY MODE", f.marketId, q);
  }

  for (const gate of [
    { name: "resolved", input: { ...f, status: "resolved" as const } },
    { name: "cancelled", input: { ...f, status: "cancelled" as const } },
    { name: "closed", input: { ...f, closesAt: f.now - 1 } },
    { name: "no-anchor", input: { ...f, real: [] as RealPoint[] } },
    { name: "retired", input: { ...f, tradeCount: cfg.retireAtTrades } },
    { name: "desync", input: { ...f, probability: f.probability + 0.01 } },
    { name: "bad-probability", input: { ...f, real: [{ t: f.real[0].t, p: 0 }], probability: 0 } },
    { name: "future-open", input: { ...f, real: [{ t: f.now + DAY, p: 0.5 }], probability: 0.5 } },
  ]) {
    const r = buildDisplayHistory(gate.input, cfg);
    check(!r.synthetic && r.syntheticCount === 0, "V14 GATES", `${f.marketId}/${gate.name}`, r);
    check(r.points.length === gate.input.real.length, "V14 GATES (passthrough)", `${f.marketId}/${gate.name}`, r.points);
  }
}

/* ------------------------------ random cases ------------------------------ */

const rand = rng(SEED);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

for (let c = 0; c < CASES; c++) {
  const nAnchors = Math.floor(rand() * 8);
  const opens = NOW - Math.floor(rand() * 120 * DAY);
  const real: RealPoint[] = [{ t: opens, p: pick([0.02, 0.03, 0.05, 0.2, 0.5, 0.8, 0.97, 0.98, rand()]) }];
  for (let i = 0; i < nAnchors; i++) {
    const t = opens + Math.floor(rand() * (NOW - opens + DAY));
    real.push({ t, p: Math.min(0.999, Math.max(0.001, rand())) });
  }
  if (rand() < 0.2) real.push({ ...real[real.length - 1] }); // duplicate timestamp
  if (rand() < 0.3) real.reverse(); // unsorted input

  const sortedReal = [...real].sort((a, b) => a.t - b.t);
  const lastReal = sortedReal[sortedReal.length - 1];
  const now = pick([NOW, lastReal.t, lastReal.t - HOUR, lastReal.t + Math.floor(rand() * 30 * DAY)]);
  const input: SynthInput = {
    marketId: `rand-${c}`,
    real,
    probability: lastReal.p,
    closesAt: now + Math.floor(rand() * 200 * DAY) - 50 * DAY,
    status: pick(["open", "open", "open", "resolved", "cancelled"] as const),
    tradeCount: Math.floor(rand() * 12),
    now,
  };
  const caseCfg: SynthConfig = {
    ...cfg,
    maxDeviation: pick([0, 0.001, 0.02, 0.03, 0.05, 9]),
    relFraction: pick([0.1, 0.35, 1]),
    fillGaps: rand() < 0.8,
    windowFactor: pick([0.2, 1.4, 4]),
    maxWindowMs: Math.floor(rand() * 90) * DAY,
    minWindowMs: Math.floor(rand() * 10) * DAY,
  };
  caseCfg.minWindowMs = Math.min(caseCfg.minWindowMs, caseCfg.maxWindowMs);

  const r = buildDisplayHistory(input, caseCfg);
  if (!r.synthetic) {
    // every gate must fall back to exactly the cleaned real series
    const clean: RealPoint[] = [];
    for (const x of [...real].sort((a, b) => a.t - b.t)) {
      if (clean.length && clean[clean.length - 1].t === x.t) clean[clean.length - 1] = x;
      else clean.push(x);
    }
    check(r.points.length === clean.length, "V14 GATES (passthrough)", input.marketId, { reason: r.reason });
    continue;
  }
  checkSeries(input.marketId, input, caseCfg, r);
  check(sameSeries(r.points, buildDisplayHistory(input, caseCfg).points), "V7 DETERMINISM", input.marketId, {});
}

/* ------------------------- V18: no write path at all ---------------------- */

const src = fs.readFileSync("src/lib/synthetic-history.ts", "utf8");
for (const forbidden of [/^\s*import\s/m, /\bfrom\s+["']/, /\brequire\(/, /\.insert\(/, /\.update\(/, /Math\.random/, /Date\.now/, /new Date\(/]) {
  check(!forbidden.test(src), "V18 SEALED MODULE", forbidden.source, { forbidden: forbidden.source });
}

/* --------------------------------- report --------------------------------- */

if (SPARKLINES) {
  const blocks = "▁▂▃▄▅▆▇█";
  console.log("");
  for (const f of liveFixtures) {
    const r = buildDisplayHistory(f, cfg);
    const ps = r.points.map((q) => q.p);
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    const cols = 72;
    const spark = Array.from({ length: cols }, (_, i) => {
      const q = ps[Math.min(ps.length - 1, Math.floor((i * ps.length) / cols))];
      const f01 = hi > lo ? (q - lo) / (hi - lo) : 0.5;
      return blocks[Math.min(blocks.length - 1, Math.floor(f01 * blocks.length))];
    }).join("");
    console.log(
      `${spark}  ${(f.probability * 100).toFixed(0).padStart(3)}%  ±${(r.maxDeviation * 100).toFixed(2)}pt  ` +
        `[${(lo * 100).toFixed(2)}–${(hi * 100).toFixed(2)}]  ${r.points.length}pts  ${f.marketId}`,
    );
  }
  console.log("");
}

console.log(
  `OK: ${checks.toLocaleString("en-US")} assertions, 0 violations. ` +
    `Worst deviation = ${(worstRatio * 100).toFixed(1)}% of the allowed cap (${worstCase}). ` +
    `Fixtures built in ${fixtureMs.toFixed(0)} ms.`,
);
if (failures) process.exit(1);
