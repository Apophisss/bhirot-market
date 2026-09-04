/**
 * How elastic a market feels — the layer between the raw LMSR math in
 * `lmsr.ts` and the editorial decision "what `liquidity` should this new
 * question open with?".
 *
 * The LMSR `b` is the only knob: it is the ₪ scale over which the price moves.
 * Everything here translates it into the two numbers a human can judge — what a
 * normal ₪100 bet does to the price, and what one ₪1,000 whale can do to it.
 */
import { costToBuy, initialState, priceYes, quoteBuy, type MarketState, type Side } from "./lmsr";
import { STARTING_BALANCE } from "./db/schema";

/** The liquidity ladder offered to new markets. Steps are ×2 so the feel changes noticeably. */
export const CANDIDATE_B = [500, 1000, 2000, 4000, 8000] as const;
/** The house default every seed market uses. */
export const DEFAULT_B = 2000;
/** A normal bet: 1% of a fresh balance, and the largest button on the trade panel. */
export const NORMAL_TRADE = 100;
/** A whale: 10% of a fresh balance in one order. */
export const WHALE_TRADE = STARTING_BALANCE / 10;
/** A ₪100 bet should move the price inside this band — below it trading feels pointless, above it feels broken. */
export const NORMAL_IMPACT_PP = { min: 1, max: 8 } as const;
/** ...and one whale order should not be able to run the price further than this. */
export const WHALE_IMPACT_PP_MAX = 40;

const logit = (p: number) => Math.log(p / (1 - p));

/** ₪ needed to drag the price from where it is now to `target`. */
export function amountToReach(state: MarketState, target: number): number {
  const p0 = priceYes(state);
  const side: Side = target > p0 ? "YES" : "NO";
  return costToBuy(state, side, Math.abs(logit(target) - logit(p0)) * state.b);
}

/** Percentage points the YES price moves when `amount` is spent on `side` (signed). */
export function impactPp(state: MarketState, side: Side, amount: number): number {
  const q = quoteBuy(state, side, amount);
  return (q.priceAfter - q.priceBefore) * 100;
}

/**
 * Size of the move on the *cheap* side. ₪100 buys far more shares of a 12%
 * outcome than of an 88% one, so the cheap side is where the price moves
 * fastest and where a market can be knocked around — it is the side that
 * decides whether the liquidity is right.
 */
export function cheapSideImpact(state: MarketState, amount: number): number {
  return Math.max(impactPp(state, "YES", amount), Math.abs(impactPp(state, "NO", amount)));
}

export type Zone = "thick" | "balanced" | "thin";

export interface Verdict {
  zone: Zone;
  /** pp a ₪100 bet moves the price, cheap side */
  normalPp: number;
  /** pp a ₪1,000 order moves the price, cheap side */
  whalePp: number;
  ok: boolean;
  note: string;
}

const mag = (n: number) => `${Math.abs(n).toFixed(1)}pp`;

/** Is this (probability, liquidity) pair inside the healthy elasticity window? */
export function verdict(p: number, b: number): Verdict {
  const state = initialState(p, b);
  const normalPp = cheapSideImpact(state, NORMAL_TRADE);
  const whalePp = cheapSideImpact(state, WHALE_TRADE);
  const zone: Zone =
    normalPp < NORMAL_IMPACT_PP.min ? "thick" : normalPp > NORMAL_IMPACT_PP.max ? "thin" : "balanced";
  const ok = zone === "balanced" && whalePp <= WHALE_IMPACT_PP_MAX;
  const note =
    zone === "thick"
      ? `too thick — ₪100 moves only ${mag(normalPp)}, the price will look frozen`
      : zone === "thin"
        ? `too thin — ₪100 moves ${mag(normalPp)}, one player owns the price`
        : whalePp > WHALE_IMPACT_PP_MAX
          ? `borderline — ₪100 → ${mag(normalPp)} is fine but ₪1000 → ${mag(whalePp)} lets a whale take over`
          : `₪100 → ${mag(normalPp)}, ₪1000 → ${mag(whalePp)}`;
  return { zone, normalPp, whalePp, ok, note };
}

/** How much trading this question is expected to attract. */
export type Traffic = "hot" | "normal" | "niche";

/**
 * Liquidity for a new market: the house default when it is healthy at this
 * opening price, otherwise the healthy value closest to it. `traffic` shifts
 * one rung — a featured question many people will trade wants a thicker book,
 * a niche 48-hour question wants a thinner one so it actually moves.
 */
export function recommend(p: number, traffic: Traffic = "normal"): number {
  const healthy = CANDIDATE_B.filter((b) => verdict(p, b).ok);
  const pool: number[] = healthy.length ? [...healthy] : [...CANDIDATE_B];
  const base = pool.reduce((best, b) => (Math.abs(b - DEFAULT_B) < Math.abs(best - DEFAULT_B) ? b : best), pool[0]);
  if (traffic === "normal") return base;
  return pool[pool.indexOf(base) + (traffic === "hot" ? 1 : -1)] ?? base;
}
