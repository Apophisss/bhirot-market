/**
 * What a sale is actually about — picking the side that is held.
 *
 * The trade panel's side selector is shared by both actions. For a BUY the
 * default ("כן") is a fine one: every side is buyable. For a SELL it is not —
 * only a side the trader actually holds can be sold, and opening the sell tab on
 * an empty side is what produced "מניות למכירה (יש לך 0)" and a dead button
 * right above a position box listing a real holding: the panel telling a holder
 * they never bought anything.
 *
 * Dependency-free leaf module (like `lmsr.ts` and `format.ts`), so the client
 * panel and the tests can both use it without dragging anything else along.
 */

import type { Side } from "./lmsr";

/** Only the two share counts matter here — any position row satisfies this. */
export interface HeldPosition {
  yesShares: number;
  noShares: number;
}

export const otherSide = (side: Side): Side => (side === "YES" ? "NO" : "YES");

/** Shares held on one side. No position, or a broken number, means nothing held. */
export function sharesOn(position: HeldPosition | null | undefined, side: Side): number {
  const n = side === "YES" ? position?.yesShares ?? 0 : position?.noShares ?? 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** True when there is something to sell on either side. */
export function hasAnyShares(position: HeldPosition | null | undefined): boolean {
  return sharesOn(position, "YES") > 0 || sharesOn(position, "NO") > 0;
}

/**
 * The side the sell tab should open on: `preferred` when it is held, otherwise
 * the other side when THAT is the one holding shares.
 *
 * With nothing held anywhere the preference stands — there is nothing to sell
 * either way, and flipping the selector under the trader would only confuse.
 */
export function sellSide(position: HeldPosition | null | undefined, preferred: Side): Side {
  if (sharesOn(position, preferred) > 0) return preferred;
  const other = otherSide(preferred);
  return sharesOn(position, other) > 0 ? other : preferred;
}

/**
 * What the sell box starts at: the whole holding, so "מכירה" quotes exactly the
 * value the portfolio just showed instead of an empty form and a dash.
 *
 * Truncated, never rounded up — a value above the holding would trip the panel's
 * own limit check, and the ≤0.0001 shares left behind are written off by the
 * engine (`DUST_SHARES` in `trade.ts`), so this still means "sell everything".
 */
export function sellPrefill(position: HeldPosition | null | undefined, side: Side): string {
  const held = sharesOn(position, side);
  return held > 0 ? String(Math.floor(held * 1e4) / 1e4) : "";
}
