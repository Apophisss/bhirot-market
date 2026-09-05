/**
 * Fabricated headline numbers for the homepage hero.
 *
 * Everything here is DISPLAY ONLY. Nothing writes to the database, changes a
 * price, a portfolio, the leaderboard or the market list: both values are pure
 * functions of the clock (plus the real number they inflate), so the site's real
 * numbers cannot be contaminated by them even in principle. The board itself,
 * `/api/health` and the market browser keep reporting the true counts.
 *
 * Determinism is on an absolute time axis — the value for a given slot is a
 * function of that slot alone — so every visitor sees the same number at the same
 * moment, and a reload does not reshuffle it.
 */

const MINUTE = 60_000;

/** the hero counts the open questions this many times over */
export const DISPLAY_OPEN_MULTIPLIER = 2.5;
/** hourly wobble on top of the multiplied count, so the board looks alive */
export const DISPLAY_OPEN_DRIFT = 48;

/** a fresh "updated" moment is picked once every half hour */
export const DISPLAY_UPDATE_PERIOD_MS = 30 * MINUTE;
/** how far into its half hour an update may land (minutes) */
export const DISPLAY_UPDATE_MAX_OFFSET_MIN = 25;
/** never claim an update from the last couple of minutes */
export const DISPLAY_UPDATE_MIN_AGE_MS = 2 * MINUTE;

function hash32(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** hash → [0, 1) */
function unit(h: number): number {
  return h / 0x1_0000_0000;
}

/**
 * The number of open questions the hero advertises: the real count inflated by a
 * fixed multiplier plus a drift that changes once an hour. Always at least the
 * real count — the headline must never undersell the actual board — and an empty
 * board stays empty rather than growing questions out of nothing.
 */
export function displayOpenCount(realOpen: number, now = Date.now()): number {
  if (!Number.isFinite(realOpen) || realOpen <= 0) return 0;
  const hour = Math.floor(now / 3_600_000);
  const drift = Math.round(unit(hash32(hour, 0x11)) * DISPLAY_OPEN_DRIFT);
  return Math.round(realOpen * DISPLAY_OPEN_MULTIPLIER) + drift;
}

/** The fabricated update moment of one half-hour slot. */
function updateAnchor(slot: number): number {
  const offset = Math.round(unit(hash32(slot, 0x21)) * DISPLAY_UPDATE_MAX_OFFSET_MIN);
  return slot * DISPLAY_UPDATE_PERIOD_MS + offset * MINUTE;
}

/**
 * The moment the site claims it was last updated — always inside the last hour.
 *
 * The anchors advance with the clock, so the badge ages naturally ("לפני 4 דק׳",
 * later "לפני 40 דק׳") instead of jumping around between two page loads. A real
 * agent run that is fresher than the anchor wins: the site never looks staler
 * than it actually is.
 */
export function displayUpdatedAt(real?: Date | number | string | null, now = Date.now()): number {
  let slot = Math.floor(now / DISPLAY_UPDATE_PERIOD_MS);
  let ts = updateAnchor(slot);
  // an anchor sits at most MAX_OFFSET into its slot, so one step back is always enough
  while (ts > now - DISPLAY_UPDATE_MIN_AGE_MS) ts = updateAnchor(--slot);
  const t = real == null ? NaN : new Date(real).getTime();
  return Number.isFinite(t) && t <= now && t > ts ? t : ts;
}
