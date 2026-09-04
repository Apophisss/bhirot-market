/* ---------------------------------------------------------------------------
 * DISPLAY ONLY — a fabricated ("synthetic") probability history for the chart.
 *
 * These points are NEVER written to the `price_history` table. That table is the
 * audit trail behind every executed trade and every settlement, and it has no
 * provenance column (src/lib/db/schema.ts), so a fabricated row written there
 * would be indistinguishable from a real one forever. This module therefore has
 * no imports at all — no db, no clock, no randomness — and eslint.config.mjs
 * keeps it that way in both directions.
 *
 * The guarantee this module exists to provide:
 *
 *   the drawn curve never differs from the recorded price by more than
 *   `effectiveDeviation(anchor)` — at most SYNTH_HARD_MAX_DEVIATION (5 points),
 *   3 points by default, and much less for markets priced near 0 or 1 —
 *   and the LAST point is bit-exactly the market's real current probability.
 *
 * "The recorded price" means A(t), the step-hold (last-observation-carried-
 * forward) reading of the real price_history rows. That is not an approximation:
 * an LMSR price only moves when qYes/qNo move, and executeTrade writes exactly
 * one price_history row in the same transaction that moves them, so between two
 * rows the true price is literally constant. Before the first row the market did
 * not exist yet, and its opening price is the only defensible estimate.
 * ------------------------------------------------------------------------- */

export interface RealPoint {
  t: number;
  p: number;
}

/** A point on the chart. `synthetic` is set only on fabricated points. */
export interface DisplayPoint {
  t: number;
  p: number;
  synthetic?: true;
}

export interface SynthConfig {
  enabled: boolean;
  /** absolute cap on |synthetic − real|, in probability units. Clamped to SYNTH_HARD_MAX_DEVIATION. */
  maxDeviation: number;
  /** the cap also never exceeds relFraction × min(anchor, 1 − anchor) — a ±3pt band would double a 3% market. */
  relFraction: number;
  /** fabricate between real trades too, not only before the market opened */
  fillGaps: boolean;
  /** deviation multiplier inside a real trading gap, where the truth is precisely known */
  gapFactor: number;
  /** how far back the fabricated prefix reaches: windowFactor × market lifetime, clamped */
  windowFactor: number;
  minWindowMs: number;
  maxWindowMs: number;
  /** nothing is ever drawn before this instant (start of the campaign) */
  epochMs: number;
  /** the fabricated deviation fades to zero within this distance of any real point */
  pinMs: number;
  /** `now` is quantised to this grid so the series is stable between renders */
  clockStepMs: number;
  /** denser sampling over the most recent `tailWindowMs`, for the 1D/1W ranges */
  tailStepMs: number;
  tailWindowMs: number;
  minPoints: number;
  maxPoints: number;
  pFloor: number;
  pCeil: number;
  /** slowest noise octave */
  baseWaveMs: number;
  octaves: number;
  seedSalt: string;
  /** once a market has this many real trades the fabrication retires completely */
  retireAtTrades: number;
}

export interface SynthInput {
  marketId: string;
  /** exactly what getPriceHistory() returns */
  real: RealPoint[];
  /** market.probability — the LMSR cache, and the value the last point must equal */
  probability: number;
  closesAt: number;
  status: "open" | "resolved" | "cancelled";
  tradeCount: number;
  now: number;
}

export interface DisplayHistory {
  points: DisplayPoint[];
  /** true when at least one point is fabricated */
  synthetic: boolean;
  syntheticCount: number;
  /** points not marked as an estimate (recorded rows plus the exact current price) */
  realCount: number;
  /** rows that actually came from the price_history table */
  recordedCount: number;
  /** the market's opening instant — where the fabricated prefix ends */
  opensAt: number | null;
  /** the effective cap actually applied to this market (0 when nothing was fabricated) */
  maxDeviation: number;
  /** the clock this series was built against — echoed back so callers need not read it again */
  now: number;
  generator: string;
  /** why nothing was fabricated, when nothing was */
  reason?: string;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const SYNTH_VERSION = 1;

/** No config, env var or caller can produce a wider band than this. */
export const SYNTH_HARD_MAX_DEVIATION = 0.05;

/** Upper bound on the noise amplitude, so the clamp is a second line of defence rather than the only one. */
const AMP_MAX = 0.9;

/** Fills the band without pressing against it; see field(). */
const GAIN = 1.5;

/** Typical spread of the raw field, measured over the octave stack; see marketGain(). */
const TARGET_SD = 0.5;

/** 17.7.2026, the dissolution of the 25th Knesset — no price line is ever drawn before the campaign. */
export const CAMPAIGN_EPOCH_MS = 1_784_235_600_000;

export const DEFAULT_SYNTH_CONFIG: SynthConfig = {
  enabled: true,
  maxDeviation: 0.03,
  relFraction: 0.35,
  fillGaps: true,
  gapFactor: 0.35,
  windowFactor: 1.4,
  minWindowMs: 7 * DAY,
  maxWindowMs: 30 * DAY,
  epochMs: CAMPAIGN_EPOCH_MS,
  pinMs: 6 * HOUR,
  clockStepMs: 15 * MIN,
  tailStepMs: HOUR,
  tailWindowMs: 72 * HOUR,
  minPoints: 40,
  maxPoints: 320,
  pFloor: 0.005,
  pCeil: 0.995,
  baseWaveMs: 4 * DAY,
  octaves: 5,
  seedSalt: "bhirot-2026",
  retireAtTrades: 8,
};

/* ---------------------------------- math --------------------------------- */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (f: number) => f * f * (3 - 2 * f);
const unit = (u: number) => u / 0xffffffff;
const sym = (u: number) => unit(u) * 2 - 1;

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
 * Value noise on an ABSOLUTE time axis: the value at t is a function of t alone,
 * never of `now` or of where the window happens to start. That is what makes the
 * fabricated past immutable — reload the page tomorrow and yesterday looks the
 * same, which a cumulative random walk could not promise.
 * `hold` keeps the finest octave piecewise-constant, which is what gives the
 * curve the small flat steps a thin order book produces.
 */
function octave(seed: number, t: number, waveMs: number, epochMs: number, hold: boolean): number {
  const u = (t - epochMs) / waveMs;
  const i = Math.floor(u);
  if (hold) return sym(hash32(seed, i));
  const g = smoothstep(u - i);
  return sym(hash32(seed, i)) * (1 - g) + sym(hash32(seed, i + 1)) * g; // convex ⇒ [-1, 1]
}

/**
 * Fractional Brownian-ish field in [-1, 1]. Deliberately stationary: no jumps,
 * no time-of-day term, no ramp toward the close. A fabricated curve must never
 * look like it reacted to a dated real-world event — that is the form of the lie
 * that would actually travel ("the market moved when the interview aired").
 */
function rawField(seed: number, t: number, cfg: SynthConfig): number {
  let sum = 0;
  let power = 0;
  let amp = 1;
  let wave = cfg.baseWaveMs;
  for (let k = 0; k < cfg.octaves; k++) {
    sum += amp * octave(hash32(seed, 0x100 + k), t, wave, cfg.epochMs, k === cfg.octaves - 1);
    power += amp * amp;
    amp *= 0.5;
    wave *= 0.5;
  }
  return power > 0 ? sum / Math.sqrt(power) : 0;
}

/**
 * Per-market gain. A handful of octaves over one market's window is a small
 * sample, so some seeds land in a quiet stretch of the field and would draw the
 * dead flat line this whole module exists to avoid. Measuring the market's own
 * spread on a FIXED window (derived from its opening instant, never from `now`)
 * and correcting for it keeps every chart equally alive while staying immutable.
 */
function marketGain(seed: number, opensAt: number, cfg: SynthConfig): number {
  const from = opensAt - cfg.maxWindowMs;
  const n = 128;
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const v = rawField(seed, from + ((opensAt - from) * i) / n, cfg);
    sum += v;
    sq += v * v;
  }
  const sd = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
  return GAIN * (sd > 1e-6 ? clamp(TARGET_SD / sd, 0.5, 3) : 1);
}

/**
 * The noise, in [-1, 1]. Deliberately stationary: no jumps, no time-of-day term,
 * no ramp toward the close. A fabricated curve must never look like it reacted to
 * a dated real-world event — that is the form of the lie that would actually
 * travel ("the market moved when the interview aired").
 *
 * tanh both fills the band and saturates smoothly, so |field| < 1 STRICTLY
 * whatever the gain: the by-construction half of the bound survives untouched,
 * and the curve never flat-tops against the clamp.
 */
function field(gain: number, seed: number, t: number, cfg: SynthConfig): number {
  return Math.tanh(gain * rawField(seed, t, cfg));
}

/* --------------------------------- anchors -------------------------------- */

/**
 * A(t) — the real price at t: last observation carried forward, held flat at the
 * opening price before the market existed. This is what the bound is measured
 * against, and it is exact (see the file header).
 */
export function anchorAt(anchors: RealPoint[], t: number): number {
  if (!anchors.length) return NaN;
  if (t <= anchors[0].t) return anchors[0].p;
  let lo = 0;
  let hi = anchors.length - 1;
  let res = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].t <= t) {
      res = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return anchors[res].p;
}

/** The cap actually applied around an anchor: absolute, hard-capped, and shrunk near 0 and 1. */
export function effectiveDeviation(anchor: number, cfg: SynthConfig): number {
  if (!Number.isFinite(anchor)) return 0;
  const abs = Math.min(Math.max(0, cfg.maxDeviation), SYNTH_HARD_MAX_DEVIATION);
  return Math.max(0, Math.min(abs, cfg.relFraction * Math.min(anchor, 1 - anchor)));
}

/* -------------------------------- generator ------------------------------- */

/** Sampling ladder. Nested (each rung is a multiple of the finer ones) so that a
 *  coarser rung keeps a subset of the finer rung's instants. */
const LADDER = [5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY];

/** Extra samples around every real point, so the curve converges into it smoothly
 *  whatever the coarse step is. Absolute offsets ⇒ still immutable. */
const PIN_OFFSETS = [1, 15 * MIN, HOUR, 3 * HOUR, 6 * HOUR];

export function buildDisplayHistory(input: SynthInput, config: SynthConfig = DEFAULT_SYNTH_CONFIG): DisplayHistory {
  const cfg = config;
  const { marketId, probability, closesAt, status, tradeCount, now } = input;

  const sorted: RealPoint[] = input.real
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.p))
    .map((r) => ({ t: r.t, p: clamp(r.p, 0, 1) }))
    .sort((a, b) => a.t - b.t);
  // de-duplicate identical timestamps, last write wins
  const clean: RealPoint[] = [];
  for (const r of sorted) {
    if (clean.length && clean[clean.length - 1].t === r.t) clean[clean.length - 1] = r;
    else clean.push(r);
  }

  const passthrough = (reason: string): DisplayHistory => ({
    points: clean.map((r) => ({ t: r.t, p: r.p })),
    synthetic: false,
    syntheticCount: 0,
    realCount: clean.length,
    recordedCount: clean.length,
    opensAt: clean.length ? clean[0].t : null,
    maxDeviation: 0,
    now,
    generator: `synthetic-history@${SYNTH_VERSION}`,
    reason,
  });

  /* -- gates: every one of them fails closed, to the real series ------------ */
  if (!cfg.enabled) return passthrough("disabled");
  if (status !== "open") return passthrough("not-open"); // a settled market's real chart is the whole story
  if (!Number.isFinite(now) || !Number.isFinite(closesAt)) return passthrough("bad-clock");
  if (closesAt <= now) return passthrough("closed");
  if (!clean.length) return passthrough("no-anchor");
  if (tradeCount >= cfg.retireAtTrades) return passthrough("retired"); // real trading tells the story now
  if (!(probability > 0 && probability < 1)) return passthrough("bad-probability");
  const opensAt = clean[0].t;
  if (opensAt > now) return passthrough("future-open");
  // markets.probability must equal the last price_history row (trade.ts writes both in one
  // transaction). If it does not, something is broken elsewhere — refuse rather than paper over it.
  if (Math.abs(clean[clean.length - 1].p - probability) > 1e-9) return passthrough("desync");

  /* -- window and anchors -------------------------------------------------- */
  const tEnd = Math.max(Math.floor(now / cfg.clockStepMs) * cfg.clockStepMs, clean[clean.length - 1].t);
  const anchors: RealPoint[] = clean.slice();
  if (tEnd > anchors[anchors.length - 1].t) anchors.push({ t: tEnd, p: probability });

  const window = clamp(cfg.windowFactor * (closesAt - opensAt), cfg.minWindowMs, cfg.maxWindowMs);
  // tStart is derived from the market's own opening, never from `now`, so the left edge never slides.
  const tStart = Math.min(opensAt, Math.max(cfg.epochMs, opensAt - window));
  if (!(tEnd > tStart)) return passthrough("empty-window");

  /* -- sample grid --------------------------------------------------------- */
  const span = tEnd - tStart;
  let si = LADDER.findIndex((s) => span / s <= cfg.maxPoints);
  if (si < 0) si = LADDER.length - 1;
  while (si > 0 && span / LADDER[si] < cfg.minPoints) si--;
  const step = LADDER[si];

  const times = new Set<number>([tStart, tEnd]);
  const gridEnd = cfg.fillGaps ? tEnd : Math.min(tEnd, opensAt);
  for (let t = Math.ceil(tStart / step) * step; t < gridEnd; t += step) times.add(t);
  if (cfg.fillGaps) {
    const tailFrom = Math.max(tStart, tEnd - cfg.tailWindowMs);
    for (let t = Math.ceil(tailFrom / cfg.tailStepMs) * cfg.tailStepMs; t < tEnd; t += cfg.tailStepMs) times.add(t);
  }
  const exact = new Map<number, number>();
  for (const a of anchors) {
    if (a.t < tStart || a.t > tEnd) continue;
    times.add(a.t);
    exact.set(a.t, a.p);
    for (const d of PIN_OFFSETS) {
      if (a.t - d > tStart) times.add(a.t - d);
      if (cfg.fillGaps && a.t + d < tEnd) times.add(a.t + d);
    }
  }
  const grid = [...times].sort((a, b) => a - b);

  /* -- emit ---------------------------------------------------------------- */
  const seed = fnv1a32(`${cfg.seedSalt}|${marketId}|v${SYNTH_VERSION}`);
  const energy = 0.5 + (AMP_MAX - 0.5) * unit(hash32(seed, 0xa1)); // per-market character, ≤ AMP_MAX
  const gain = marketGain(seed, opensAt, cfg);
  const out: DisplayPoint[] = [];
  let j = 0; // last anchor at or before t
  let k = 0; // first anchor at or after t

  for (const t of grid) {
    const real = exact.get(t);
    if (real !== undefined) {
      out.push({ t, p: real }); // real, verbatim: no noise, no clamp, no flag
      continue;
    }
    while (j + 1 < anchors.length && anchors[j + 1].t <= t) j++;
    while (k < anchors.length && anchors[k].t < t) k++;
    const before = anchors[j].t <= t ? anchors[j].t : Infinity;
    const after = k < anchors.length ? anchors[k].t : Infinity;

    const a = anchorAt(anchors, t);
    const inGap = t > opensAt; // between real observations, where the price is known exactly
    if (inGap && !cfg.fillGaps) continue;
    const dev = effectiveDeviation(a, cfg) * (inGap ? cfg.gapFactor : 1);

    // Absolute distance to the nearest real point on EITHER side. Signed distance
    // here would pin the whole pre-opening prefix flat.
    const dist = Math.min(Math.abs(t - before), Math.abs(after - t));
    const pin = smoothstep(clamp(dist / cfg.pinMs, 0, 1)); // 0 at every real point

    const lo = Math.max(cfg.pFloor, a - dev);
    const hi = Math.min(cfg.pCeil, a + dev);
    if (!(lo <= hi) || !(dev > 0)) {
      out.push({ t, p: a, synthetic: true });
      continue;
    }
    const raw = a + dev * energy * pin * field(gain, seed, t, cfg);
    const rounded = Math.round(raw * 1e4) / 1e4; // round first, clamp last
    out.push({ t, p: Number.isFinite(rounded) ? clamp(rounded, lo, hi) : a, synthetic: true });
  }

  /* -- self-verification: never return an unverified series ----------------- */
  let prev = -Infinity;
  let syntheticCount = 0;
  for (const q of out) {
    if (q.synthetic) syntheticCount++;
    const a = anchorAt(anchors, q.t);
    const cap = effectiveDeviation(a, cfg) + 1e-12;
    const ok =
      Number.isFinite(q.t) &&
      Number.isFinite(q.p) &&
      q.t > prev &&
      q.t <= tEnd &&
      q.p >= 0 &&
      q.p <= 1 &&
      (!q.synthetic || Math.abs(q.p - a) <= cap);
    if (!ok) {
      console.error("[synthetic-history] invariant violation", marketId, q);
      return passthrough("invariant-violation");
    }
    prev = q.t;
  }
  // Nothing was fabricated (a collapsed window, or prefix-only mode with no prefix):
  // hand back the real series untouched rather than a series with an extra endpoint.
  if (syntheticCount === 0) return passthrough("nothing-to-fabricate");

  const last = out[out.length - 1];
  if (!last || last.p !== probability || last.synthetic) return passthrough("terminal-mismatch");

  return {
    points: out,
    synthetic: syntheticCount > 0,
    syntheticCount,
    realCount: out.length - syntheticCount,
    recordedCount: clean.length,
    opensAt,
    maxDeviation: syntheticCount > 0 ? effectiveDeviation(clean[0].p, cfg) : 0,
    now,
    generator: `synthetic-history@${SYNTH_VERSION}`,
  };
}
