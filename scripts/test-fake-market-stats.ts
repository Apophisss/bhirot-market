/**
 * Property-checks the per-question fabricated activity (src/lib/fake-market-stats.ts).
 *
 * Four promises, and each of them is the kind that only breaks in production:
 *
 *   1. **Never zero.** No open question ever advertises 0 trades or ₪0 — that is the
 *      whole reason the module exists, and it has to hold for a question created one
 *      second ago as much as for one created a year ago.
 *   2. **Monotone.** Trades and volume only ever grow as the clock advances. A number
 *      that walks backwards between two page loads reads as a bug.
 *   3. **Deterministic.** The same market at the same moment yields the same numbers
 *      and the same trade list — otherwise two visitors, or a server render and its
 *      own hydration, disagree.
 *   4. **Never undersells reality.** The displayed pair is always at least the recorded
 *      pair, so a genuinely busy question never reads quieter than it is.
 *
 * And two site rules the fabrications must not break: a fabricated bet stays inside
 * the ₪1–₪100 cap `executeTrade` enforces, and a fabricated timestamp is never in the
 * future.
 *
 *   npm run test:fakes                    # 60,000 random markets
 *   npm run test:fakes -- --cases=500000
 *
 * Exits 1 on the first violations and prints the failing case.
 */
import {
  FAKE_TRADES_CAP,
  FAKE_TRADES_FLOOR,
  fakeMarketTrades,
  marketActivity,
  mergeTrades,
  type ActivityInput,
} from "../src/lib/fake-market-stats";
import { epochAt, fabricatedTraders } from "../src/lib/fake-leaderboard";
import { MAX_BET, MIN_BET, THIN_MARKET_TRADES } from "../src/lib/limits";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const arg = process.argv.find((a) => a.startsWith("--cases="));
const CASES = arg ? Number(arg.slice("--cases=".length)) : 60_000;
const NOW = Date.UTC(2026, 8, 5, 12);

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) return;
  failures++;
  console.error(`✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  if (failures > 10) {
    console.error("aborting after 10 failures");
    process.exit(1);
  }
}

function randomMarket(i: number): ActivityInput & { probability: number; title: string } {
  const ageMs = Math.floor(Math.random() ** 3 * 400 * DAY);
  const openFor = Math.floor(Math.random() * 200 * DAY);
  return {
    id: `q-${i}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    title: `שאלה ${i}`,
    probability: 0.01 + Math.random() * 0.98,
    volume: Math.random() < 0.7 ? 0 : Math.round(Math.random() * 5000),
    tradeCount: Math.random() < 0.7 ? 0 : Math.floor(Math.random() * 60),
    createdAt: NOW - ageMs,
    closesAt: NOW - ageMs + openFor,
    status: Math.random() < 0.8 ? "open" : Math.random() < 0.5 ? "resolved" : "cancelled",
    featured: Math.random() < 0.15,
  };
}

/* ---------------------------- the headline pair ---------------------------- */

check(
  "a market created this instant already shows activity",
  marketActivity({ id: "brand-new", volume: 0, tradeCount: 0, createdAt: NOW, closesAt: NOW + DAY, status: "open" }, NOW)
    .tradeCount >= FAKE_TRADES_FLOOR,
);

check(
  "the floor clears the thin-market caveat, so a fresh question is not flagged as untraded",
  FAKE_TRADES_FLOOR >= THIN_MARKET_TRADES,
  { FAKE_TRADES_FLOOR, THIN_MARKET_TRADES },
);

for (let i = 0; i < CASES; i++) {
  const m = randomMarket(i);
  const a = marketActivity(m, NOW);

  check("never advertises zero trades", a.tradeCount > 0, { m, a });
  check("never advertises zero volume", a.volume > 0, { m, a });
  check("never undersells the recorded trades", a.tradeCount >= m.tradeCount, { m, a });
  check("never undersells the recorded volume", a.volume >= m.volume, { m, a });
  check("stays under the cap", a.tradeCount <= FAKE_TRADES_CAP + m.tradeCount, { m, a });
  check("is deterministic", JSON.stringify(marketActivity(m, NOW)) === JSON.stringify(a), { m });

  // monotone: the same market, later, never reads quieter
  const later = marketActivity(m, NOW + Math.floor(Math.random() * 30 * DAY));
  check("trades never walk backwards", later.tradeCount >= a.tradeCount, { m, a, later });
  check("volume never walks backwards", later.volume >= a.volume, { m, a, later });

  // a closed question freezes at its deadline rather than drifting upward forever
  if (m.status !== "open" && Number(m.closesAt) < NOW) {
    const muchLater = marketActivity(m, NOW + 365 * DAY);
    check("a closed question stops collecting trades", muchLater.tradeCount === a.tradeCount, { m, a, muchLater });
  }
}

/* ----------------------------- the trade list ------------------------------ */

for (let i = 0; i < Math.min(CASES, 4000); i++) {
  const m = randomMarket(i);
  const list = fakeMarketTrades(m, 12, NOW);

  check("the list has the length it was asked for", list.length === 12, { m, n: list.length });
  check("ids are unique", new Set(list.map((t) => t.id)).size === list.length, { m });
  check("is deterministic", JSON.stringify(fakeMarketTrades(m, 12, NOW)) === JSON.stringify(list), { m });

  let prev = Infinity;
  for (const t of list) {
    const ts = t.createdAt.getTime();
    check("newest first", ts <= prev, { m, ts, prev });
    prev = ts;
    check("never in the future", ts <= NOW, { m, ts });
    check("respects the site's bet cap", t.amount >= MIN_BET && t.amount <= MAX_BET, { m, amount: t.amount });
    check("prices stay inside the probability range", t.priceAfter > 0 && t.priceAfter < 1, { m, p: t.priceAfter });
    check("prices sit beside the real one", Math.abs(t.priceAfter - m.probability) <= 0.03, { m, p: t.priceAfter });
    // shares are priced off the market's own probability, floored at ₪0.02 so a
    // question at 1% does not hand out a hundred thousand shares for ₪100
    const paid = Math.max(0.02, t.side === "YES" ? Math.min(0.98, Math.max(0.02, m.probability)) : 1 - Math.min(0.98, Math.max(0.02, m.probability)));
    check("shares are worth what was paid", Math.abs(t.shares * paid - t.amount) < 0.01, { m, t, paid });
  }

  // the merge orders by time and keeps every real row it was given
  const real = [{ id: 1, createdAt: new Date(NOW - HOUR) }, { id: 2, createdAt: new Date(NOW - 3 * HOUR) }];
  const merged = mergeTrades(real, list, 25);
  check("the merge keeps the real rows", real.every((r) => merged.includes(r)), { m });
  let mprev = Infinity;
  for (const t of merged) {
    const ts = new Date(t.createdAt).getTime();
    check("the merge is newest first", ts <= mprev, { m, ts, mprev });
    mprev = ts;
  }
}

/* ------------------ the board and the leaderboard must agree ------------------ */

/*
  The fabricated crowd on /leaderboard shows a trade count per row that a visitor can
  add up. Those trades must have happened on the board, so the board's own numbers
  have to come out the same order of magnitude — otherwise the two pages contradict
  each other one click apart. This is the check that pins the constants in
  `fake-market-stats.ts` to the ones in `fake-leaderboard.ts`.
*/
{
  const OPEN = 340; // the board's current size, near enough
  const AGE = DAY; // and how old a question on it typically is
  let board = 0;
  for (let i = 0; i < OPEN; i++) {
    board += marketActivity(
      { id: `board-${i}`, volume: 0, tradeCount: 0, createdAt: NOW - AGE, closesAt: NOW + 30 * DAY, status: "open" },
      NOW,
    ).tradeCount;
  }
  const crowd = fabricatedTraders(epochAt(NOW)).reduce((s, t) => s + t.tradeCount, 0);
  const ratio = board / crowd;
  check("the board carries roughly the trades the leaderboard claims", ratio > 0.6 && ratio < 1.7, {
    board,
    crowd,
    ratio: Number(ratio.toFixed(2)),
  });
}

if (failures) {
  console.error(`\n${failures} violation(s)`);
  process.exit(1);
}
console.log(`✓ fake market stats: ${CASES.toLocaleString("en-US")} markets, all properties hold`);
