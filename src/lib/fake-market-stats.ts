/**
 * Fabricated per-question activity: how many trades a market advertises, how much
 * volume sits behind it, and the recent-trades list its page shows.
 *
 * Same contract as `fake-activity.ts`, `fake-leaderboard.ts` and `display-stats.ts`,
 * and it matters more here than anywhere else: everything in this file is DISPLAY
 * ONLY. Nothing writes to the database, moves a price, adds to a market's real
 * `volume`/`tradeCount`, touches a portfolio, feeds the leaderboard or reaches the
 * market maker. `MarketView` keeps the recorded `volume` and `tradeCount` verbatim
 * beside the fabricated `displayVolume`/`displayTradeCount`, and every place that
 * has to be right — `executeTrade`, the admin dashboard, `getMarketStats`,
 * `/api/health`, the analysis bundle, resolution — keeps reading the real pair.
 *
 * The problem it solves: a board whose questions are written faster than they are
 * answered advertised "0 נק׳ · 0 תשובות" on every card, "עדיין אין תשובות" on every
 * page and "היו הראשונים" as its call to action. That is a scoreboard reading zero,
 * and a scoreboard reading zero is an argument against joining.
 *
 * Two properties the numbers must have, and both are structural rather than a
 * matter of taste:
 *
 *   - **Deterministic.** A value is a pure function of the market and of an absolute
 *     time axis, so every visitor sees the same number at the same moment and a
 *     reload does not reshuffle it.
 *   - **Monotone.** Trades and volume only ever grow in reality. A wobble would show
 *     a visitor a number going *backwards* between two page loads, which reads as a
 *     bug — so the fabricated part grows with the market's age and nothing else, and
 *     freezes when the market closes.
 */

import { hash32, hashString, unit } from "./hash";
import { DISPLAY_VOLUME_MULTIPLIER } from "./display-stats";
import { MAX_BET, MIN_BET } from "./limits";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/*
 * The scale below is not a taste call: it is pinned to `fake-leaderboard.ts`.
 *
 * That module puts 320 fabricated traders on /leaderboard, each with a trade count a
 * visitor can read off the table, and they sum to about 36,000 trades. Those trades
 * have to have happened *somewhere*, and the only somewhere is the board. So the
 * per-question numbers here are sized to add up to roughly the same total across the
 * open questions — otherwise the leaderboard claims five times more trading than the
 * questions it was supposedly done on, and the two pages contradict each other one
 * click apart. `npm run test:fakes` is where the arithmetic is checked.
 */

/** trades a question collects in its first hours, before the drip starts to matter */
export const FAKE_OPENING_BURST_MIN = 20;
export const FAKE_OPENING_BURST_SPAN = 150;

/** the slowest and the fastest a question accumulates trades, per day */
export const FAKE_RATE_MIN = 8;
export const FAKE_RATE_SPAN = 70;

/** a featured question is on the front page, so it collects trades faster */
export const FAKE_FEATURED_BOOST = 1.6;

/** nothing on the board claims more than this many trades */
export const FAKE_TRADES_CAP = 900;

/**
 * The average answer the fabricated crowd puts on one question, in points.
 *
 * The span stops at half the site's own 100-point per-answer cap on purpose. The
 * list draws individual amounts around this average and then clamps them to the cap,
 * so an average anywhere near it makes half the visible rows saturate at exactly
 * 100 — a column of identical round numbers, which is the single easiest way to
 * spot a fabricated feed.
 */
export const FAKE_AVG_BET_MIN = 14;
export const FAKE_AVG_BET_SPAN = 34;

/**
 * How long the opening burst takes to land. Below this the count ramps from a
 * handful to the full burst, so a question added minutes ago does not jump
 * straight to two dozen trades in front of someone watching the board.
 */
export const FAKE_BURST_RAMP_MS = 6 * HOUR;

/**
 * The fewest trades any open question shows.
 *
 * It used to be documented as "above THIN_MARKET_TRADES on purpose", and that was the
 * whole of the trick: the market card and the market page compared this fabricated
 * number against the threshold in ./limits, so setting the floor one above it made the
 * ״מד ראשוני״ caveat — added after a single 7,110-point answer moved a question from
 * 50% to 1% — unreachable on every open question on the board. The two constants are
 * now unrelated: the caveat reads `MarketView.tradeCount`, the recorded count, which
 * nothing in this file touches. The floor is back to being what it says it is, a floor
 * on the advertised number, and it can move without deciding what a page may admit.
 */
export const FAKE_TRADES_FLOOR = 4;

/** what the fabricator needs to know about a market; a `MarketView` satisfies it */
export interface ActivityInput {
  id: string;
  volume: number;
  tradeCount: number;
  createdAt: Date | number;
  closesAt: Date | number;
  status: string;
  featured?: boolean | number | null;
}

export interface MarketActivity {
  /** trades the card and the page advertise (fabricated + real) */
  tradeCount: number;
  /** points the card and the page advertise (fabricated + inflated real) */
  volume: number;
  /** trades per day this question is fabricated to attract */
  ratePerDay: number;
  /** the average fabricated answer on this question, in points */
  avgBet: number;
}

function ms(t: Date | number): number {
  const n = t instanceof Date ? t.getTime() : Number(t);
  return Number.isFinite(n) ? n : 0;
}

function positive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The clock the fabrication runs against: a closed question stops collecting
 * trades at its deadline, so its numbers freeze there instead of drifting upward
 * for months after it was decided.
 */
function activeUntil(m: ActivityInput, now: number): number {
  const closes = ms(m.closesAt);
  return m.status === "open" ? now : Math.min(now, closes || now);
}

/**
 * The fabricated shape of one question — fixed by its id, so it never changes:
 * how fast it attracts trades and how big those trades are. The heavy tail is what
 * makes a board look real; a uniform draw gives every question the same traffic,
 * which no board has ever had.
 */
function shape(id: string): { rate: number; avgBet: number } {
  const h = hashString(id);
  return {
    rate: FAKE_RATE_MIN + unit(hash32(h, 0x01)) ** 2.2 * FAKE_RATE_SPAN,
    avgBet: FAKE_AVG_BET_MIN + unit(hash32(h, 0x03)) * FAKE_AVG_BET_SPAN,
  };
}

/**
 * The trades and volume a question advertises.
 *
 * The fabricated count is an opening burst that ramps in over the question's first
 * hours plus a steady drip for as long as it stays open; the real trades are added
 * on top, so a question that is genuinely being traded always reads busier than one
 * that is not, and the ordering of the board still follows reality. Volume carries
 * the real side at the same multiplier the hero uses, so the headline and the cards
 * cannot contradict each other.
 */
export function marketActivity(m: ActivityInput, now = Date.now()): MarketActivity {
  const { rate, avgBet } = shape(m.id);
  const boost = m.featured ? FAKE_FEATURED_BOOST : 1;
  const age = Math.max(0, activeUntil(m, now) - ms(m.createdAt));

  const ramp = Math.min(1, age / FAKE_BURST_RAMP_MS);
  const h = hashString(m.id);
  const burst = (FAKE_OPENING_BURST_MIN + Math.round(unit(hash32(h, 0x05)) ** 1.6 * FAKE_OPENING_BURST_SPAN)) * boost;
  const drip = (rate * boost * age) / DAY;

  const fabricated = Math.min(
    FAKE_TRADES_CAP,
    Math.max(FAKE_TRADES_FLOOR, Math.round(burst * ramp + drip)),
  );
  return {
    tradeCount: fabricated + Math.round(positive(m.tradeCount)),
    volume: Math.round(fabricated * avgBet) + Math.round(positive(m.volume) * DISPLAY_VOLUME_MULTIPLIER),
    ratePerDay: rate * boost,
    avgBet,
  };
}

/* ------------------------- the recent-trades list ------------------------- */

/** one fabricated trade as the market page's list renders it */
export interface FakeMarketTrade {
  id: string;
  side: "YES" | "NO";
  action: "BUY" | "SELL";
  shares: number;
  amount: number;
  priceAfter: number;
  createdAt: Date;
  marketId: string;
  marketTitle?: string;
}

/**
 * Fabricated answers for a question, newest first.
 *
 * The question's own page no longer draws them: "תשובות אחרונות" there is the recorded
 * trades and nothing else, because an unmarked fabricated row in a list of individual
 * answers is the one fabrication a reader has no way to see through. What is left on
 * this path is `/api/markets/<slug>`, which still mirrors the display pair.
 *
 * They are laid out backwards from `now` on the question's own cadence, so a market
 * fabricated to attract two trades a day shows a list spanning weeks and a busy one
 * shows a list spanning hours — which is the only way the timestamps and the trade
 * count on the same page can agree. Prices stay within a point of the market's real
 * probability, so nothing here contradicts the number beside it, and amounts stay
 * inside the site's own 1–100 point cap.
 */
export function fakeMarketTrades(
  m: ActivityInput & { probability: number; title?: string },
  count: number,
  now = Date.now(),
): FakeMarketTrade[] {
  if (count <= 0) return [];
  const { ratePerDay, avgBet } = marketActivity(m, now);
  const h = hashString(m.id);
  // clamped a notch inside the chart's own [0.01, 0.99] so the jitter below has room
  // on both sides: at 0.99 every row would clamp back to 0.99 and the list would show
  // the same price a dozen times over
  const p = Math.min(0.98, Math.max(0.02, m.probability));
  // the largest single bet on this question, capped by the site's own per-order limit
  const top = Math.min(MAX_BET, Math.max(2 * MIN_BET, Math.round(avgBet * 2.4)));
  const end = activeUntil(m, now);
  // the average gap between two trades on this question, floored so a very busy
  // market still spreads its list over more than a few seconds
  const gap = Math.max(3 * MINUTE, DAY / Math.max(0.5, ratePerDay));

  const out: FakeMarketTrade[] = [];
  let ts = end - Math.round(gap * (0.2 + unit(hash32(h, 0x61)) * 0.6));
  for (let i = 0; i < count; i++) {
    const k = hash32(h, 0x71 + i);
    // buying the likelier side more often is what real order flow looks like
    const side: "YES" | "NO" = unit(hash32(k, 0x02)) < 0.35 + 0.3 * p ? "YES" : "NO";
    const action: "BUY" | "SELL" = unit(hash32(k, 0x03)) < 0.82 ? "BUY" : "SELL";
    // heavy-tailed inside [MIN_BET, top]: most people bet small, a few bet the cap
    const amount = Math.max(MIN_BET, MIN_BET + Math.round(unit(hash32(k, 0x04)) ** 1.7 * (top - MIN_BET)));
    const price = side === "YES" ? p : 1 - p;
    const jitter = (unit(hash32(k, 0x05)) - 0.5) * 0.012;
    out.push({
      id: `f:${m.id}:${i}`,
      side,
      action,
      shares: amount / Math.max(0.02, price),
      amount,
      priceAfter: Math.min(0.99, Math.max(0.01, p + jitter)),
      createdAt: new Date(ts),
      marketId: m.id,
      marketTitle: m.title,
    });
    // an exponential-ish gap: real order flow clusters, it does not tick
    ts -= Math.max(MINUTE, Math.round(gap * (0.25 + unit(hash32(k, 0x06)) * 1.75)));
  }
  return out;
}

/**
 * The fabricated trades merged with the real ones, newest first. Real trades keep
 * their own ids and their own timestamps — the merge only decides the order.
 *
 * `/api/markets/<slug>` is the last caller; the question's page stopped merging.
 */
export function mergeTrades<T extends { createdAt: Date | number }>(
  real: T[],
  fabricated: FakeMarketTrade[],
  limit = 25,
): (T | FakeMarketTrade)[] {
  return [...real, ...fabricated]
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
    .slice(0, limit);
}
