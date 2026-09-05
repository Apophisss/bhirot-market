/**
 * Site-wide limits on a single answer.
 *
 * Dependency-free leaf module (like `lmsr.ts` and `rapid.ts`) so the trade panel,
 * the rapid deck and the server routes can share the same numbers without pulling
 * the database client into the browser bundle.
 */

/**
 * Game points every new account starts with.
 *
 * It lives in this leaf module rather than in `db/schema.ts`, where it used to be
 * declared, because the browser needs it too — the rapid deck's sign-in gate says
 * what a visitor gets for signing up — and importing the schema into a client
 * component would drag drizzle's table builders into the browser bundle. The
 * schema re-exports it, so every existing import keeps working.
 */
export const STARTING_BALANCE = 10_000;

/** Smallest amount the pricing engine will quote, in points. */
export const MIN_BET = 1;

/**
 * Hard cap on a single answer, in points — a player can never put more than this on
 * one answer, in the full answer panel or in rapid mode. Enforced in the UI so the
 * limit is visible, and again in `executeTrade()`, which is the only place that binds.
 */
export const MAX_BET = 100;

/**
 * Upper bound on a SELL order, counted in answers held rather than points: taking an
 * answer back is not a new answer, and 100 points buys far more than 100 of them at a
 * low price, so the cap must not trap a player inside a position they already hold.
 */
export const MAX_SELL_SHARES = 100_000;

/**
 * Below this many trades a price is still essentially the opening estimate the
 * editorial team set, not an answer the crowd arrived at — the market card and
 * the market page say so rather than presenting it as a settled number.
 *
 * Two trades is the threshold and not one: a single counter-trade is enough to
 * move a thin market by tens of points, so a price that has been tested exactly
 * once is no more "traded" than a price that has never been tested at all.
 */
export const THIN_MARKET_TRADES = 3;
