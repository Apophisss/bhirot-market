/* ---------------------------------------------------------------------------
 * "רחשי שוק" — the small, real price movement a quiet market gets on its own.
 *
 * A board where nothing moves reads as a board nobody is on. Between two real
 * answers an LMSR price is mathematically frozen: the quote only changes when
 * someone buys, so a question with no traffic shows the exact same number for
 * days, and the chart is a ruler. This module decides how the house market
 * maker shades its own quote in the meantime, the way a bookmaker moves a line
 * that has taken no action.
 *
 * This is NOT the display-only family (`fake-activity.ts`, `fake-market-stats.ts`,
 * `synthetic-history.ts`). A drift tick is a REAL move: `market-drift.ts` walks
 * the LMSR state to the price this module returns, so the gauge, the trade panel,
 * every open position and the recorded `price_history` row all agree, and the
 * quote a trader is shown is the quote they get. Nothing here is fabricated
 * after the fact — the price genuinely was what the row says it was.
 *
 * What that costs is stated plainly: a drift tick moves open positions by a
 * fraction of a point without anyone having traded. That is the same thing a
 * real prediction market does to a holder overnight, it is bounded by the
 * guarantee below, and it is virtual money either way.
 *
 * The guarantee this module exists to provide:
 *
 *   the quote never sits further than `driftBand(anchor)` from the anchor —
 *   at most DRIFT_HARD_MAX_DEVIATION (5 points), 2.5 points by default, and
 *   much less near 0 or 1 — where the anchor is the price the last REAL trade
 *   left behind. One trade re-centres the whole wander on the traded price,
 *   so drift can never carry a market away from what its traders think.
 *
 * The wander is a pure function of (market id, wall clock): value noise on an
 * absolute time axis, never a cumulative random walk. A random walk would have
 * no bound, would depend on how often the job happened to run, and could not be
 * reproduced from the price row after the fact. This one can: given the anchor
 * and the timestamp, anyone can recompute the exact price that was written.
 *
 * Like `synthetic-history.ts`, the file is deliberately sealed — no db, no
 * clock, no randomness, no imports at all, and eslint.config.mjs keeps it that
 * way. Everything it needs is an argument, which is also what makes the whole
 * policy testable (`scripts/test-drift.ts`).
 * ------------------------------------------------------------------------- */

export interface DriftConfig {
  enabled: boolean;
  /** hard ceiling on |quote − anchor|, in probability units. Clamped to DRIFT_HARD_MAX_DEVIATION. */
  maxDeviation: number;
  /** the band also never exceeds relFraction × min(anchor, 1 − anchor) — ±2.5pt would double a 3% market. */
  relFraction: number;
  /** the most one tick may move the price. Clamped to DRIFT_HARD_MAX_STEP. */
  maxStep: number;
  /** below this the tick is skipped instead of written: a 0.05pt row is noise in the audit trail, not movement */
  minStep: number;
  /** a market counts as quiet once this long has passed with no real trade */
  quietMs: number;
  /** minimum spacing between two drift ticks on the same market, whatever the job's cadence */
  minIntervalMs: number;
  /** no drift this close to the close: the price a market settles at is one traders set */
  freezeBeforeCloseMs: number;
  /** ...and none this soon after it opened, so a brand-new question is quoted where its author priced it */
  warmupMs: number;
  /** the quote never leaves these, well inside the LMSR trading band */
  pFloor: number;
  pCeil: number;
  /** slowest noise octave — the period over which a quiet market makes its full swing */
  baseWaveMs: number;
  octaves: number;
  seedSalt: string;
}

const MIN = 60_000;
const HOUR = 3_600_000;

export const DRIFT_VERSION = 1;

/** No config, env var or caller can produce a wider band than this. */
export const DRIFT_HARD_MAX_DEVIATION = 0.05;

/** ...nor a single tick larger than this. Above it the movement stops reading as drift and starts reading as news. */
export const DRIFT_HARD_MAX_STEP = 0.02;

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  enabled: true,
  maxDeviation: 0.025,
  relFraction: 0.35,
  maxStep: 0.006,
  minStep: 0.0015,
  quietMs: 6 * HOUR,
  minIntervalMs: 25 * MIN,
  freezeBeforeCloseMs: 2 * HOUR,
  warmupMs: HOUR,
  pFloor: 0.02,
  pCeil: 0.98,
  baseWaveMs: 8 * HOUR,
  octaves: 4,
  seedSalt: "bhirot-drift-2026",
};

/* ---------------------------------- math --------------------------------- */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (f: number) => f * f * (3 - 2 * f);
const unit = (u: number) => u / 0xffffffff;
const sym = (u: number) => unit(u) * 2 - 1;

/** Rounded to 0.01 of a point: the price is written to a real column and read back by the chart. */
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

function fnv1a32(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hash32(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * One octave of value noise on an ABSOLUTE time axis: the value at t depends on
 * t alone, never on when the job last ran. That is what makes the wander
 * independent of the cadence — running the drift job every ten minutes and
 * running it every hour trace the same curve, one just samples it more finely.
 */
function octave(seed: number, t: number, waveMs: number): number {
  const u = t / waveMs;
  const i = Math.floor(u);
  const g = smoothstep(u - i);
  return sym(hash32(seed, i)) * (1 - g) + sym(hash32(seed, i + 1)) * g; // convex ⇒ [-1, 1]
}

/** Seed for one market's wander. Exported so the runner can log it beside a written row. */
export function driftSeed(marketId: string, cfg: DriftConfig = DEFAULT_DRIFT_CONFIG): number {
  return fnv1a32(`${cfg.seedSalt}|${marketId}|v${DRIFT_VERSION}`);
}

/**
 * The wander, in (−1, 1). A few octaves so the line has both a slow lean and
 * small hourly wobble, and tanh so it fills the band without ever pressing flat
 * against it — the bound below stays true by construction, not by clamping.
 *
 * Deliberately stationary: no time-of-day term, no ramp toward the close, no
 * jumps. A price that moved on its own must never look like it reacted to a
 * dated real-world event — that is the form of the lie that would travel
 * ("the market moved when the interview aired").
 */
export function driftField(seed: number, t: number, cfg: DriftConfig = DEFAULT_DRIFT_CONFIG): number {
  let sum = 0;
  let power = 0;
  let amp = 1;
  let wave = cfg.baseWaveMs;
  for (let k = 0; k < Math.max(1, cfg.octaves); k++) {
    sum += amp * octave(hash32(seed, 0x100 + k), t, wave);
    power += amp * amp;
    amp *= 0.5;
    wave *= 0.5;
  }
  const norm = power > 0 ? sum / Math.sqrt(power) : 0;
  return Math.tanh(1.4 * norm);
}

/** The band actually applied around an anchor: absolute, hard-capped, and shrunk near 0 and 1. */
export function driftBand(anchor: number, cfg: DriftConfig = DEFAULT_DRIFT_CONFIG): number {
  if (!Number.isFinite(anchor) || anchor <= 0 || anchor >= 1) return 0;
  const abs = Math.min(Math.max(0, cfg.maxDeviation), DRIFT_HARD_MAX_DEVIATION);
  return Math.max(0, Math.min(abs, cfg.relFraction * Math.min(anchor, 1 - anchor)));
}

/**
 * Where a quiet market's quote wants to be at instant t. Always inside
 * `driftBand(anchor)` of the anchor, and inside [pFloor, pCeil].
 *
 * Note what is NOT here: any dependence on the current price. The target is the
 * anchor plus a bounded wander, so the quote is pulled back toward the traded
 * price whenever the noise passes through zero. Mean reversion for free, and no
 * way for a long quiet stretch to accumulate into a large move.
 */
export function driftTargetAt(
  marketId: string,
  anchor: number,
  t: number,
  cfg: DriftConfig = DEFAULT_DRIFT_CONFIG,
): number {
  const dev = driftBand(anchor, cfg);
  if (!(dev > 0) || !Number.isFinite(t)) return anchor;
  const raw = anchor + dev * driftField(driftSeed(marketId, cfg), t, cfg);
  return clamp(round4(raw), Math.max(cfg.pFloor, anchor - dev), Math.min(cfg.pCeil, anchor + dev));
}

/* -------------------------------- the plan -------------------------------- */

export type DriftSkipReason =
  | "disabled"
  | "not-open"
  | "closed"
  | "closing-soon"
  | "warming-up"
  | "bad-input"
  | "traded-recently"
  | "too-soon"
  | "no-room"
  | "too-small";

export interface DriftInput {
  marketId: string;
  status: "open" | "resolved" | "cancelled";
  /** the quote right now — `markets.probability` */
  probability: number;
  /** the price the last REAL trade left behind (the opening price for a market that never traded) */
  anchor: number;
  /** epoch ms of that last real trade, or of the market's opening row */
  lastTradeAt: number;
  /** epoch ms of the last drift tick on this market, null if it has never drifted */
  lastDriftAt: number | null;
  /** epoch ms the market opened (`markets.createdAt`) */
  opensAt: number;
  closesAt: number;
  now: number;
}

export type DriftPlan =
  | { move: false; reason: DriftSkipReason }
  | {
      move: true;
      /** the quote this plan was computed against — the runner refuses to apply it if the market has since moved */
      from: number;
      /** the quote to write */
      to: number;
      /** where the wander wanted to be; `to` is that, step-limited */
      target: number;
      anchor: number;
      deviation: number;
    };

/**
 * The whole policy for one market, in one pure function.
 *
 * Every gate fails closed (to "do not touch this market"), and they are ordered
 * cheapest-and-most-decisive first so a skip reason names the real cause.
 */
export function planDrift(input: DriftInput, cfg: DriftConfig = DEFAULT_DRIFT_CONFIG): DriftPlan {
  const { marketId, status, probability, anchor, lastTradeAt, lastDriftAt, opensAt, closesAt, now } = input;

  if (!cfg.enabled) return { move: false, reason: "disabled" };
  if (status !== "open") return { move: false, reason: "not-open" };
  if (![probability, anchor, lastTradeAt, opensAt, closesAt, now].every((v) => Number.isFinite(v))) {
    return { move: false, reason: "bad-input" };
  }
  if (!(probability > 0 && probability < 1) || !(anchor > 0 && anchor < 1)) return { move: false, reason: "bad-input" };
  if (closesAt <= now) return { move: false, reason: "closed" };
  if (closesAt - now < cfg.freezeBeforeCloseMs) return { move: false, reason: "closing-soon" };
  if (now - opensAt < cfg.warmupMs) return { move: false, reason: "warming-up" };
  // a market with real answers on it tells its own story; drift is for the silence
  if (now - lastTradeAt < cfg.quietMs) return { move: false, reason: "traded-recently" };
  if (lastDriftAt != null && now - lastDriftAt < cfg.minIntervalMs) return { move: false, reason: "too-soon" };

  // a market the board has priced outside the drift's operating range is left exactly
  // where its author or its traders put it: at 1% there is no "small move" to make,
  // and every nudge would be a large relative change to the answer
  if (anchor < cfg.pFloor || anchor > cfg.pCeil) return { move: false, reason: "no-room" };
  const deviation = driftBand(anchor, cfg);
  if (!(deviation > 0)) return { move: false, reason: "no-room" };

  const target = driftTargetAt(marketId, anchor, now, cfg);
  const step = clamp(target - probability, -Math.min(cfg.maxStep, DRIFT_HARD_MAX_STEP), Math.min(cfg.maxStep, DRIFT_HARD_MAX_STEP));
  // the band is measured from the anchor, so a quote that somehow starts outside it
  // (a config that narrowed, a hand-edited row) is walked back in rather than pinned
  const lo = Math.max(cfg.pFloor, Math.min(anchor - deviation, probability));
  const hi = Math.min(cfg.pCeil, Math.max(anchor + deviation, probability));
  const to = round4(clamp(probability + step, lo, hi));

  if (!(Math.abs(to - probability) >= cfg.minStep)) return { move: false, reason: "too-small" };
  return { move: true, from: probability, to, target, anchor, deviation };
}
