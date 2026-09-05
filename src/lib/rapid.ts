/**
 * "מצב זריז" — the rapid-fire answering mode.
 *
 * Dependency-free leaf module (like `lmsr.ts` and `format.ts`) so both the client
 * deck and the server route can import it without dragging the database client
 * into the browser bundle. The database query lives in `rapid-feed.ts`.
 *
 * Every answer is a binding BUY on the LMSR market maker, and a single answer is
 * confined to a fixed shekel range so a fast run stays fast and a mis-tap stays
 * cheap. The range is enforced twice: by the slider here, and again by
 * `POST /api/rapid/answer`, which is the only place that actually binds.
 */

import { MAX_BET } from "./limits";

export const RAPID_MIN_STAKE = 5;
/** The site-wide bet cap — rapid mode never lets an answer exceed it. */
export const RAPID_MAX_STAKE = MAX_BET;
export const RAPID_STAKE_STEP = 5;
export const RAPID_STAKE_PRESETS = [5, 10, 25, 50, 100].filter((v) => v <= RAPID_MAX_STAKE);
export const RAPID_DEFAULT_STAKE = 20;

/** Nudges any number into the binding range (used by the slider and by the localStorage restore). */
export function clampStake(v: number): number {
  if (!Number.isFinite(v)) return RAPID_DEFAULT_STAKE;
  return Math.min(RAPID_MAX_STAKE, Math.max(RAPID_MIN_STAKE, Math.round(v)));
}

/* ------------------------------------------------------------ the spark --
 * The question's past, small enough to ship sixty of them inside one page.
 *
 * A deck card cannot afford the market page's full series (up to 320 points each),
 * so the curve is down-sampled here and sent in a compact form: minute offsets from
 * `from`, and probabilities in basis points. Provenance travels with it — a sample
 * that stands for any fabricated point is marked as an estimate, so the deck can
 * draw it dashed exactly like the big chart does. See src/lib/synthetic-history.ts.
 */

/** how many samples a card's curve is reduced to — a whole deck of these travels in one page */
export const RAPID_SPARK_SAMPLES = 32;

export interface RapidSpark {
  /** epoch ms of the first sample */
  from: number;
  /** minute offsets from `from`, ascending */
  m: number[];
  /** probability × 10000 at each offset */
  bp: number[];
  /** 1 where the sample stands for a display-only estimate, 0 where it is recorded trading */
  syn: number[];
  /** how far an estimate may stray from the recorded price, in probability units (null when nothing is estimated) */
  band: number | null;
}

/** One decoded sample of the curve. */
export interface RapidSparkPoint {
  t: number;
  p: number;
  synthetic: boolean;
}

interface SparkInput {
  t: number;
  p: number;
  synthetic?: boolean;
}

/**
 * Down-samples to at most `max` points, keeping the first instant and the last
 * point (the current price) exactly.
 *
 * A bucket that contains ANY fabricated point is marked as an estimate. Over-marking
 * is the one safe direction: the drawn curve may claim less real trading than there
 * was, never more.
 */
function sampleSpark(points: SparkInput[], max: number): RapidSparkPoint[] {
  if (points.length <= max) return points.map((q) => ({ t: q.t, p: q.p, synthetic: Boolean(q.synthetic) }));
  const out: RapidSparkPoint[] = [];
  const n = points.length;
  for (let i = 0; i < max; i++) {
    const start = Math.floor((i * n) / max);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / max));
    const rep = points[end - 1];
    let synthetic = false;
    for (let j = start; j < end; j++) if (points[j].synthetic) synthetic = true;
    // the left edge keeps its real instant: a bucket's representative is its last
    // point, which would otherwise shift the start of the line a few samples in
    const head = i === 0 ? points[0] : rep;
    out.push({ t: head.t, p: head.p, synthetic });
  }
  return out;
}

/**
 * Packs a display series (`DisplayHistory.points`) into the wire form above.
 * Returns null when there is not enough of a past to draw.
 */
export function buildRapidSpark(
  points: SparkInput[],
  opts: { now: number; current: number; isOpen: boolean; band?: number | null; max?: number },
): RapidSpark | null {
  const sorted = points.filter((q) => Number.isFinite(q.t) && Number.isFinite(q.p)).sort((a, b) => a.t - b.t);
  if (!sorted.length) return null;
  const last = sorted[sorted.length - 1];
  // the appended "now" point is the real current price, never an estimate — the same
  // rule the market page's chart follows
  const series = opts.isOpen && opts.now > last.t ? [...sorted, { t: opts.now, p: opts.current }] : sorted;
  if (series.length < 2) return null;

  const sampled = sampleSpark(series, opts.max ?? RAPID_SPARK_SAMPLES);
  const from = sampled[0].t;
  const m = sampled.map((q) => Math.round((q.t - from) / 60_000));
  // a curve that fits inside a single minute has no past worth drawing
  if (m[m.length - 1] <= 0) return null;
  return {
    from,
    m,
    bp: sampled.map((q) => Math.round(q.p * 10_000)),
    syn: sampled.map((q) => (q.synthetic ? 1 : 0)),
    band: opts.band ?? null,
  };
}

/** The inverse of `buildRapidSpark` — what the deck draws. */
export function rapidSparkPoints(s: RapidSpark): RapidSparkPoint[] {
  return s.m.map((m, i) => ({ t: s.from + m * 60_000, p: s.bp[i] / 10_000, synthetic: s.syn[i] === 1 }));
}

export type RapidSort = "mix" | "closing" | "new" | "hot";

export const RAPID_SORTS: { id: RapidSort; label: string }[] = [
  { id: "mix", label: "מומלץ בשבילי" },
  { id: "closing", label: "נסגר בקרוב" },
  { id: "new", label: "חדשות" },
  { id: "hot", label: "חמות" },
];

/** One question as the deck needs it — plain data, safe to hand across the RSC boundary. */
export interface RapidCard {
  id: string;
  title: string;
  subtitle: string | null;
  categoryLabel: string;
  categoryAccent: string;
  image: string;
  fallbackImage: string;
  personName: string | null;
  probability: number;
  qYes: number;
  qNo: number;
  liquidity: number;
  /** epoch ms — a Date would survive the RSC boundary but not a future JSON feed endpoint */
  closesAt: number;
  volume: number;
  tradeCount: number;
  byTeam: boolean;
  /** the price curve behind the question — null when the market has no drawable past */
  spark: RapidSpark | null;
}
