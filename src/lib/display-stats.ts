/**
 * Fabricated headline numbers for the homepage hero.
 *
 * Everything here is DISPLAY ONLY. Nothing writes to the database, changes a
 * price, a portfolio, the leaderboard or the market list: every value is a pure
 * function of the clock and of the real number it inflates, so the site's real
 * numbers cannot be contaminated by them even in principle. The board itself,
 * `/api/health`, the market browser, every market card and every portfolio keep
 * reporting the true numbers.
 *
 * Determinism is on an absolute time axis — the value for a given slot is a
 * function of that slot alone — so every visitor sees the same number at the same
 * moment, and a reload does not reshuffle it.
 *
 * Two shapes live here, and the difference matters:
 *
 *   - the **open question count** rises and falls in reality (questions open,
 *     questions close), so it carries an hourly drift that makes the board look
 *     alive;
 *   - the **cumulative** headlines — traders, volume, resolved questions — only
 *     ever grow in reality. A wobble on those would show a visitor a number
 *     going *backwards* between two page loads, which reads as a bug, so they
 *     are plain multiples of the real number and move only when it moves.
 */

import { hash32, unit } from "./hash";
import { FAKE_TRADER_COUNT } from "./fake-leaderboard";

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

/** the hero counts every registered trader this many times over... */
export const DISPLAY_USERS_MULTIPLIER = 3;
/** ...on top of the fabricated crowd that /leaderboard already lists row by row */
export const DISPLAY_USERS_FLOOR = FAKE_TRADER_COUNT;

/** the hero counts the traded volume this many times over */
export const DISPLAY_VOLUME_MULTIPLIER = 3.4;

/** the hero counts the resolved questions this many times over */
export const DISPLAY_RESOLVED_MULTIPLIER = 2.5;

/** a real number as the inflators are willing to read it: finite and non-negative */
function positive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The number of traders the hero advertises: the real signups inflated by a
 * fixed multiplier, plus the fabricated crowd of `fake-leaderboard.ts`.
 *
 * The floor is not decoration — those traders are rows a visitor can literally
 * count on /leaderboard, so a headline below `DISPLAY_USERS_FLOOR` would be
 * contradicted by the site's own page one click away.
 */
export function displayUserCount(realUsers: number): number {
  return DISPLAY_USERS_FLOOR + Math.round(positive(realUsers) * DISPLAY_USERS_MULTIPLIER);
}

/**
 * The traded volume the hero advertises: the real volume, inflated. A board with
 * no trades yet stays at zero rather than growing money out of nothing.
 */
export function displayVolume(realVolume: number): number {
  return Math.round(positive(realVolume) * DISPLAY_VOLUME_MULTIPLIER);
}

/**
 * The number of resolved questions the hero advertises: the real count, inflated.
 * Zero resolutions stay zero — the site claims a track record only once it has
 * one.
 */
export function displayResolvedCount(realResolved: number): number {
  return Math.round(positive(realResolved) * DISPLAY_RESOLVED_MULTIPLIER);
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
