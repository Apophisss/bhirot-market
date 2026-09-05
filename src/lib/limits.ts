/**
 * Site-wide trading limits.
 *
 * Dependency-free leaf module (like `lmsr.ts` and `rapid.ts`) so the trade panel,
 * the rapid deck and the server routes can share the same numbers without pulling
 * the database client into the browser bundle.
 */

/** Smallest bet the market maker will price, in ₪. */
export const MIN_BET = 1;

/**
 * Hard cap on a single bet, in ₪ — a user can never risk more than this on one
 * order, in the full trade panel or in rapid mode. Enforced in the UI so the limit
 * is visible, and again in `executeTrade()`, which is the only place that binds.
 */
export const MAX_BET = 100;

/**
 * Upper bound on a SELL order, counted in shares rather than ₪: closing a position
 * is not a bet, and ₪100 buys far more than 100 shares at a low price, so the bet
 * cap must not trap a user inside their own position.
 */
export const MAX_SELL_SHARES = 100_000;
