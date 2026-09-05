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
 * The **cumulative** headlines — traders, volume, resolved questions — only ever
 * grow in reality. A wobble on those would show a visitor a number going
 * *backwards* between two page loads, which reads as a bug, so they are plain
 * multiples of the real number and move only when it moves.
 *
 * The **open question count** is the one headline that is not inflated at all,
 * and `displayOpenCount` is here to be the single place that says so. See its
 * note: a number the board itself contradicts is not a headline, it is an error
 * message with a marketing budget.
 */

import { hash32, unit } from "./hash";
import { FAKE_TRADER_COUNT } from "./fake-leaderboard";

const MINUTE = 60_000;

/** a fresh "updated" moment is picked once every half hour */
export const DISPLAY_UPDATE_PERIOD_MS = 30 * MINUTE;
/** how far into its half hour an update may land (minutes) */
export const DISPLAY_UPDATE_MAX_OFFSET_MIN = 25;
/** never claim an update from the last couple of minutes */
export const DISPLAY_UPDATE_MIN_AGE_MS = 2 * MINUTE;

/** a real number as the inflators are willing to read it: finite and non-negative */
function positive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The number of open questions the site advertises: the real one.
 *
 * This used to be the real count times 2.5, plus an hourly drift — and the number
 * it produced was contradicted by the site's own board, on the same screen. The
 * home page promised "894 שאלות פתוחות על הקמפיין" and "מצב זריז · 894 שאלות ברצף"
 * directly above a category filter reading "כל השאלות 339" and a list reading
 * "12 מתוך 339"; `/welcome` said 339 as well. A visitor arriving from an ad met a
 * headline that the first scroll disproved.
 *
 * The argument is the same one that gives `displayUserCount` its floor, only
 * sharper: an inflated count of *countable, listed things* is not a headline a
 * fabricated number can carry, because the reader can count them. So the open
 * count is real everywhere, and this function is the one place that decides it —
 * every "שאלות פתוחות" on the site comes through here or through the same
 * `count(status='open')` that feeds it (`getMarketStats`, `getCategoryCounts`).
 *
 * The cumulative headlines below are a different case and are still inflated:
 * nobody can count the site's historical volume by scrolling.
 */
export function displayOpenCount(realOpen: number): number {
  return Math.round(positive(realOpen));
}

/** the hero counts every registered trader this many times over... */
export const DISPLAY_USERS_MULTIPLIER = 3;
/** ...on top of the fabricated crowd that /leaderboard already lists row by row */
export const DISPLAY_USERS_FLOOR = FAKE_TRADER_COUNT;

/** the hero counts the traded volume this many times over */
export const DISPLAY_VOLUME_MULTIPLIER = 3.4;

/** the hero counts the resolved questions this many times over */
export const DISPLAY_RESOLVED_MULTIPLIER = 2.5;

/**
 * The number of players the hero advertises: the real signups inflated by a
 * fixed multiplier, plus the fabricated crowd of `fake-leaderboard.ts`.
 *
 * The floor is not decoration — those players are rows a visitor can literally
 * count on /leaderboard, so a headline below `DISPLAY_USERS_FLOOR` would be
 * contradicted by the site's own page one click away.
 *
 * That argument runs in both directions, which is why /leaderboard sizes its
 * fabricated crowd from THIS function rather than from `FAKE_TRADER_COUNT`
 * directly. The hero counts every registered account; the board can only list the
 * ones that have actually answered something, because `getLeaderboard()` drops the
 * rest. With a fixed crowd the two disagreed by exactly the signups who never
 * played — 335 in the hero against 324 rows on the board, and growing. The board
 * is now `displayUserCount(users)` rows long by construction, so the only way to
 * change one number is to change both.
 */
export function displayUserCount(realUsers: number): number {
  return DISPLAY_USERS_FLOOR + Math.round(positive(realUsers) * DISPLAY_USERS_MULTIPLIER);
}

/**
 * The traded volume the hero advertises: the real volume, inflated, and never below
 * `boardFloor`.
 *
 * The `ceil` floor is what keeps the promise honest below a shekel: rounding
 * alone turns a real ₪0.02 into ₪0, and a headline that *undersells* the board is
 * the one thing these numbers must never do.
 *
 * `boardFloor` is the same rule applied one level up. Every card on the page prints
 * its own volume (`MarketView.displayVolume`, see `fake-market-stats.ts`), so a
 * visitor can add the board up by hand; the caller passes that sum, and the headline
 * covers it. Without it the hero would claim a smaller market than the one listed
 * directly underneath it.
 */
export function displayVolume(realVolume: number, boardFloor = 0): number {
  const real = positive(realVolume);
  return Math.max(Math.round(real * DISPLAY_VOLUME_MULTIPLIER), Math.ceil(real), Math.round(positive(boardFloor)));
}

/**
 * The number of resolved questions the hero advertises: the real count, inflated.
 * Zero resolutions stay zero — the site claims a track record only once it has
 * one — and, as with the volume above, the count is never rounded below itself.
 */
export function displayResolvedCount(realResolved: number): number {
  const real = positive(realResolved);
  return Math.max(Math.round(real * DISPLAY_RESOLVED_MULTIPLIER), Math.ceil(real));
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
