/**
 * Logarithmic Market Scoring Rule (LMSR) for a binary market.
 *
 * State: (qYes, qNo) = net shares sold of each outcome, b = liquidity.
 * Cost function  C(q) = b * ln(e^{qYes/b} + e^{qNo/b})
 * Price of YES   p    = e^{qYes/b} / (e^{qYes/b} + e^{qNo/b})
 *
 * All math is done in log space so large q values never overflow.
 */

export type Side = "YES" | "NO";

export interface MarketState {
  qYes: number;
  qNo: number;
  b: number;
}

function logSumExp(a: number, c: number): number {
  const m = Math.max(a, c);
  return m + Math.log(Math.exp(a - m) + Math.exp(c - m));
}

/** ln(e^x - e^y), requires x > y */
function logDiffExp(x: number, y: number): number {
  return x + Math.log1p(-Math.exp(y - x));
}

export function cost({ qYes, qNo, b }: MarketState): number {
  return b * logSumExp(qYes / b, qNo / b);
}

export function priceYes({ qYes, qNo, b }: MarketState): number {
  const x = (qYes - qNo) / b;
  return 1 / (1 + Math.exp(-x));
}

export function price(state: MarketState, side: Side): number {
  const p = priceYes(state);
  return side === "YES" ? p : 1 - p;
}

/** q vector after selling `shares` of `side` to a trader (negative shares = trader sells back). */
export function apply(state: MarketState, side: Side, shares: number): MarketState {
  return side === "YES"
    ? { ...state, qYes: state.qYes + shares }
    : { ...state, qNo: state.qNo + shares };
}

/** Amount a trader pays to buy `shares` of `side`. */
export function costToBuy(state: MarketState, side: Side, shares: number): number {
  return cost(apply(state, side, shares)) - cost(state);
}

/** Amount a trader receives for selling `shares` of `side` back to the market. */
export function proceedsFromSell(state: MarketState, side: Side, shares: number): number {
  return cost(state) - cost(apply(state, side, -shares));
}

/** How many `side` shares a trader gets for spending `amount` (closed form). */
export function sharesForAmount(state: MarketState, side: Side, amount: number): number {
  if (amount <= 0) return 0;
  const { b } = state;
  const qSide = side === "YES" ? state.qYes : state.qNo;
  const qOther = side === "YES" ? state.qNo : state.qYes;
  const target = (cost(state) + amount) / b; // ln(e^{(qSide+d)/b} + e^{qOther/b})
  const newQSideOverB = logDiffExp(target, qOther / b);
  return newQSideOverB * b - qSide;
}

/** Initial state so that the YES price equals `p` with zero net inventory on NO. */
export function initialState(p: number, b: number): MarketState {
  const clamped = Math.min(0.97, Math.max(0.03, p));
  return { qYes: b * Math.log(clamped / (1 - clamped)), qNo: 0, b };
}

/**
 * Trading is confined to a 1%–99% price band. LMSR itself stays well-defined
 * outside it, but a saturated book hands out absurd share counts for pocket
 * change (₪1 buying 100k shares), which reads as broken to players. Orders that
 * would leave the band are rejected with the largest size that fits.
 */
export const PRICE_BAND = { min: 0.01, max: 0.99 } as const;

/** q-difference that puts `side` exactly at probability p */
function targetGap(b: number, p: number): number {
  return b * Math.log(p / (1 - p));
}

/** Largest ₪ amount that can be spent on `side` without leaving the price band. 0 if already at the edge. */
export function maxBuyAmount(state: MarketState, side: Side): number {
  const { b } = state;
  const qSide = side === "YES" ? state.qYes : state.qNo;
  const qOther = side === "YES" ? state.qNo : state.qYes;
  const shares = qOther + targetGap(b, PRICE_BAND.max) - qSide;
  if (!(shares > 0)) return 0;
  return costToBuy(state, side, shares);
}

/** Largest number of `side` shares that can be sold without leaving the price band. */
export function maxSellShares(state: MarketState, side: Side): number {
  const { b } = state;
  const qSide = side === "YES" ? state.qYes : state.qNo;
  const qOther = side === "YES" ? state.qNo : state.qYes;
  const shares = qSide - qOther - targetGap(b, PRICE_BAND.min);
  return shares > 0 ? shares : 0;
}

/** True when both outcome prices sit inside the tradable band. */
export function withinBand(state: MarketState): boolean {
  const p = priceYes(state);
  return p >= PRICE_BAND.min - 1e-9 && p <= PRICE_BAND.max + 1e-9;
}

export interface Quote {
  shares: number;
  amount: number;
  avgPrice: number;
  priceBefore: number;
  priceAfter: number;
  /** payout if the outcome resolves in the trader's favour (buy only) */
  payout: number;
}

export function quoteBuy(state: MarketState, side: Side, amount: number): Quote {
  const shares = sharesForAmount(state, side, amount);
  const after = apply(state, side, shares);
  return {
    shares,
    amount,
    avgPrice: shares > 0 ? amount / shares : price(state, side),
    priceBefore: price(state, side),
    priceAfter: price(after, side),
    payout: shares,
  };
}

export function quoteSell(state: MarketState, side: Side, shares: number): Quote {
  const amount = proceedsFromSell(state, side, shares);
  const after = apply(state, side, -shares);
  return {
    shares,
    amount,
    avgPrice: shares > 0 ? amount / shares : price(state, side),
    priceBefore: price(state, side),
    priceAfter: price(after, side),
    payout: 0,
  };
}
