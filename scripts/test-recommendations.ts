/**
 * Invariant tests for the recommendation engine (src/lib/recommendations.ts).
 * Pure scoring only — no database. Run: npm test
 */
import assert from "node:assert/strict";
import {
  blendWeights,
  boardFrequencies,
  buildTaste,
  commonnessDamp,
  diversify,
  focusProfile,
  EMPTY_TASTE,
  HALF_LIFE_DAYS,
  MATURITY_EVENTS,
  popularityScores,
  scoreCandidate,
  tasteAffinity,
  tradeWeight,
  type ActivityRow,
  type CandidateSignals,
  type TasteEvent,
} from "../src/lib/recommendations";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}
const close = (a: number, b: number, eps = 1e-9, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} expected ${b}, got ${a}`);

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const DAY = 86_400_000;

function ev(over: Partial<TasteEvent> = {}): TasteEvent {
  return { marketId: "m", category: "polls", people: [], tags: [], at: NOW, weight: 1, ...over };
}

function candidate(over: Partial<CandidateSignals> = {}): CandidateSignals {
  return {
    id: "c",
    category: "general",
    people: [],
    tags: [],
    probability: 0.5,
    closesAt: NOW + 10 * DAY,
    createdAt: NOW - 30 * DAY,
    featured: false,
    popularity: 0,
    ...over,
  };
}

/* ---------------------------------- taste ---------------------------------- */

test("an empty history yields an empty profile", () => {
  const p = buildTaste([], NOW);
  assert.deepEqual(p.categories, {});
  close(p.strength, 0);
  assert.equal(p.markets, 0);
});

test("affinities are normalized against the user's own top interest", () => {
  const p = buildTaste(
    [
      ev({ marketId: "a", category: "polls" }),
      ev({ marketId: "b", category: "polls" }),
      ev({ marketId: "c", category: "legal" }),
    ],
    NOW,
  );
  close(p.categories.polls, 1);
  close(p.categories.legal, 0.5);
  assert.equal(p.markets, 3);
  assert.ok(!("security" in p.categories));
});

test("a trade one half-life old counts half as much", () => {
  const recent = buildTaste([ev({ category: "polls" })], NOW);
  const old = buildTaste([ev({ category: "polls", at: NOW - HALF_LIFE_DAYS * DAY })], NOW);
  close(old.strength, recent.strength / 2, 1e-9);
  // normalization keeps the single category at 1 either way
  close(old.categories.polls, 1);
});

test("recency reorders interests: yesterday's topic beats last month's", () => {
  const p = buildTaste(
    [
      ev({ marketId: "a", category: "legal", at: NOW - 1 * DAY }),
      ev({ marketId: "b", category: "polls", at: NOW - 40 * DAY }),
      ev({ marketId: "c", category: "polls", at: NOW - 45 * DAY }),
    ],
    NOW,
  );
  assert.ok(p.categories.legal > p.categories.polls, "the fresh interest should lead");
});

test("people on a market split the credit, so a crowded market is not four votes", () => {
  const solo = buildTaste([ev({ people: ["netanyahu"] })], NOW);
  const crowd = buildTaste([ev({ people: ["netanyahu", "lapid", "bennett", "golan"] })], NOW);
  // normalized to 1 in both, so compare the pre-normalization share via a mixed profile
  const mixed = buildTaste(
    [ev({ marketId: "a", people: ["solo"] }), ev({ marketId: "b", people: ["p1", "p2", "p3", "p4"] })],
    NOW,
  );
  close(solo.people.netanyahu, 1);
  close(crowd.people.netanyahu, 1);
  assert.ok(mixed.people.solo > mixed.people.p1, "a solo market says more about one person");
});

test("a bigger stake is a stronger signal, but only logarithmically", () => {
  assert.ok(tradeWeight(100) > tradeWeight(10));
  assert.ok(tradeWeight(10) > tradeWeight(5));
  // the same extra ₪10 says much less on top of a ₪100 trade than on top of a ₪10 one
  assert.ok(tradeWeight(110) - tradeWeight(100) < tradeWeight(20) - tradeWeight(10));
  close(tradeWeight(0), 0);
  close(tradeWeight(100), 1, 1e-9, "a ₪100 answer is the reference signal");
  assert.ok(tradeWeight(1e9) <= 2, "weight stays bounded");
});

/* ------------------------------- popularity -------------------------------- */

const POOL = [
  { id: "hot", volume: 5000 },
  { id: "warm", volume: 2000 },
  { id: "cold", volume: 0 },
];
const ACTIVITY: ActivityRow[] = [
  { marketId: "hot", recentAmount: 4000, recentTrades: 40, recentTraders: 12, recentComments: 5 },
  { marketId: "warm", recentAmount: 300, recentTrades: 6, recentTraders: 2, recentComments: 0 },
];

test("popularity ranks the busy market first and stays inside 0..1", () => {
  const p = popularityScores(POOL, ACTIVITY);
  assert.ok(p.get("hot")! > p.get("warm")!);
  assert.ok(p.get("warm")! > p.get("cold")!);
  for (const v of p.values()) assert.ok(v >= 0 && v <= 1, `out of range: ${v}`);
  close(p.get("hot")!, 1, 1e-9, "the busiest market maxes every component");
});

test("many small traders can outrank one whale", () => {
  const pool = [
    { id: "whale", volume: 0 },
    { id: "crowd", volume: 0 },
  ];
  const p = popularityScores(pool, [
    { marketId: "whale", recentAmount: 5000, recentTrades: 1, recentTraders: 1, recentComments: 0 },
    { marketId: "crowd", recentAmount: 4000, recentTrades: 40, recentTraders: 30, recentComments: 8 },
  ]);
  assert.ok(p.get("crowd")! > p.get("whale")!);
});

test("a board with no activity at all produces no NaNs", () => {
  const p = popularityScores([{ id: "a", volume: 0 }], []);
  close(p.get("a")!, 0);
});

/* --------------------------------- blending -------------------------------- */

test("a cold-start user is recommended purely by popularity", () => {
  const w = blendWeights(EMPTY_TASTE.strength);
  close(w.taste, 0);
  assert.ok(w.popularity > 1);

  const trendy = scoreCandidate(candidate({ id: "trendy", popularity: 1 }), EMPTY_TASTE, NOW);
  const quiet = scoreCandidate(candidate({ id: "quiet", popularity: 0 }), EMPTY_TASTE, NOW);
  assert.ok(trendy.score > quiet.score);
  assert.equal(trendy.taste, 0);
});

test("taste weight grows with history and then stops", () => {
  const w1 = blendWeights(1);
  const w6 = blendWeights(MATURITY_EVENTS);
  const w60 = blendWeights(MATURITY_EVENTS * 10);
  assert.ok(w1.taste < w6.taste);
  close(w6.taste, w60.taste, 1e-9, "a heavy trader is not weighted past maturity");
  assert.ok(w6.popularity < w1.popularity, "popularity makes room for taste");
});

test("with a real history, a matching question beats a more popular mismatch", () => {
  const profile = buildTaste(
    Array.from({ length: 8 }, (_, i) => ev({ marketId: `m${i}`, category: "legal", people: ["netanyahu"], weight: 1 })),
    NOW,
  );
  const mine = scoreCandidate(candidate({ id: "mine", category: "legal", people: ["netanyahu"], popularity: 0.2 }), profile, NOW);
  const theirs = scoreCandidate(candidate({ id: "theirs", category: "polls", popularity: 0.6 }), profile, NOW);
  assert.ok(mine.score > theirs.score, `${mine.score} should beat ${theirs.score}`);
  assert.ok(mine.reasons.some((r) => r.kind === "category" || r.kind === "person"));
});

test("popularity still breaks the tie between two equally-liked questions", () => {
  const profile = buildTaste([ev({ category: "legal" })], NOW);
  const a = scoreCandidate(candidate({ id: "a", category: "legal", popularity: 0.9 }), profile, NOW);
  const b = scoreCandidate(candidate({ id: "b", category: "legal", popularity: 0.1 }), profile, NOW);
  assert.ok(a.score > b.score);
});

test("affinity is bounded and zero for an unknown topic", () => {
  const profile = buildTaste([ev({ category: "legal", people: ["netanyahu"], tags: ["trial"] })], NOW);
  close(tasteAffinity(profile, { category: "security", people: [], tags: [] }), 0);
  const full = tasteAffinity(profile, { category: "legal", people: ["netanyahu"], tags: ["trial"] });
  assert.ok(full > 0 && full <= 1);
});

test("closing soon, fresh and uncertain all push a question up", () => {
  const base = candidate();
  const soon = scoreCandidate(candidate({ closesAt: NOW + 6 * 3600_000 }), EMPTY_TASTE, NOW);
  const fresh = scoreCandidate(candidate({ createdAt: NOW - 1 * DAY }), EMPTY_TASTE, NOW);
  const coin = scoreCandidate(candidate({ probability: 0.5 }), EMPTY_TASTE, NOW);
  const settled = scoreCandidate(candidate({ probability: 0.98 }), EMPTY_TASTE, NOW);
  const plain = scoreCandidate(base, EMPTY_TASTE, NOW);
  assert.ok(soon.score > plain.score);
  assert.ok(fresh.score > plain.score);
  assert.ok(coin.score > settled.score);
});

test("every recommendation carries at least one reason, and at most two", () => {
  const profile = buildTaste([ev({ category: "legal" })], NOW);
  for (const c of [candidate(), candidate({ category: "legal", popularity: 1, closesAt: NOW + 3600_000 })]) {
    const s = scoreCandidate(c, profile, NOW);
    assert.ok(s.reasons.length >= 1 && s.reasons.length <= 2, `got ${s.reasons.length} reasons`);
    for (const r of s.reasons) assert.ok(r.label.length > 0);
  }
});

/* ------------------------- distinctive interests --------------------------- */

test("board frequencies count each market once per person", () => {
  const f = boardFrequencies([
    { people: ["netanyahu", "netanyahu", "lapid"], tags: ["poll"] },
    { people: ["netanyahu"], tags: [] },
    { people: [], tags: ["poll"] },
    { people: ["goldknopf"], tags: [] },
  ]);
  close(f.people.netanyahu, 0.5);
  close(f.people.lapid, 0.25);
  close(f.tags.poll, 0.5);
  assert.equal(f.size, 4);
});

test("a person who is everywhere is damped harder than a rare one", () => {
  assert.ok(commonnessDamp(0.4) < commonnessDamp(0.02));
  close(commonnessDamp(0), 1);
  for (const s of [0, 0.1, 0.5, 1, 5]) assert.ok(commonnessDamp(s) > 0 && commonnessDamp(s) <= 1);
});

test("focusProfile promotes the distinctive interest over the ubiquitous one", () => {
  const profile = buildTaste(
    [
      ev({ marketId: "a", people: ["netanyahu"] }),
      ev({ marketId: "b", people: ["netanyahu"] }),
      ev({ marketId: "c", people: ["goldknopf"] }),
    ],
    NOW,
  );
  assert.ok(profile.people.netanyahu > profile.people.goldknopf, "raw counts favour the common person");
  const board = boardFrequencies([
    ...Array.from({ length: 9 }, () => ({ people: ["netanyahu"], tags: [] })),
    { people: ["goldknopf"], tags: [] },
  ]);
  const focused = focusProfile(profile, board);
  assert.ok(focused.people.goldknopf > focused.people.netanyahu, "after damping, the rare interest leads");
  close(Math.max(...Object.values(focused.people)), 1, 1e-9, "still normalized to 1");
  assert.deepEqual(focused.categories, profile.categories, "categories are a real choice — left alone");
});

/* -------------------------------- diversity -------------------------------- */

test("diversify keeps one category from taking the whole row", () => {
  const items = [
    { id: "p1", score: 10, cat: "polls" },
    { id: "p2", score: 9.5, cat: "polls" },
    { id: "p3", score: 9.4, cat: "polls" },
    { id: "l1", score: 8, cat: "legal" },
    { id: "s1", score: 7, cat: "security" },
  ];
  const out = diversify(items, (i) => i.cat, 3);
  assert.equal(out.length, 3);
  assert.equal(out[0].id, "p1", "the best pick is never demoted");
  assert.deepEqual(
    out.map((i) => i.cat),
    ["polls", "legal", "security"],
  );
});

test("diversify falls back to the plain ranking when there is only one category", () => {
  const items = [
    { id: "a", score: 3, cat: "polls" },
    { id: "b", score: 2, cat: "polls" },
  ];
  assert.deepEqual(
    diversify(items, (i) => i.cat, 5).map((i) => i.id),
    ["a", "b"],
  );
});

test("diversify never invents or drops items", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, score: 12 - i, cat: `c${i % 3}` }));
  const out = diversify(items, (i) => i.cat, 20);
  assert.equal(out.length, items.length);
  assert.equal(new Set(out.map((i) => i.id)).size, items.length);
});

console.log(`recommendations: ${passed} tests passed`);
