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
  horizonFit,
  EMPTY_TASTE,
  HALF_LIFE_DAYS,
  MATURITY_EVENTS,
  popularityScores,
  scoreCandidate,
  SURVEY_CATEGORY_AFFINITY,
  SURVEY_MAX_STRENGTH,
  SURVEY_PERSON_AFFINITY,
  SURVEY_STRENGTH_PER_PICK,
  tasteAffinity,
  tradeWeight,
  withSurvey,
  type ActivityRow,
  type CandidateSignals,
  type TasteEvent,
} from "../src/lib/recommendations";
import {
  APPEAL_DEFAULT,
  APPEAL_MAX,
  APPEAL_MIN,
  APPEAL_WEIGHT,
  appealBoost,
  appealLevel,
  clampAppeal,
} from "../src/lib/appeal";
import {
  clampTopicality,
  topicalityBoost,
  topicalityDecay,
  topicalityHeat,
  topicalityLevel,
  TOPICALITY_DEFAULT,
  TOPICALITY_HALF_LIFE_HOURS,
  TOPICALITY_MAX,
  TOPICALITY_MIN,
  TOPICALITY_WEIGHT,
} from "../src/lib/topicality";
import type { UserPreferences } from "../src/lib/preferences";

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

function prefs(over: Partial<UserPreferences> = {}): UserPreferences {
  return { topics: [], people: [], horizon: "mixed", status: "completed", version: 1, ...over };
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

/* --------------------------------- appeal ---------------------------------- */

test("the scale folds anything onto 1..5, and an unrated question is neutral", () => {
  close(appealBoost(APPEAL_DEFAULT), 0, 1e-12, "the default contributes nothing");
  close(appealBoost(undefined), 0, 1e-12, "neither does a missing rating");
  close(appealBoost(null), 0, 1e-12);
  close(appealBoost(NaN), 0, 1e-12, "and neither does a broken one");
  close(appealBoost(APPEAL_MAX), APPEAL_WEIGHT, 1e-12, "the top of the scale is the full weight");
  close(appealBoost(APPEAL_MIN), -APPEAL_WEIGHT, 1e-12, "the bottom is the full weight, downwards");
  close(appealBoost(99), APPEAL_WEIGHT, 1e-12, "off-scale is clamped, not extrapolated");
  assert.equal(clampAppeal(4.4), 4, "a rating is an integer step on the scale");
  assert.equal(clampAppeal("5" as unknown as number), APPEAL_DEFAULT, "a non-number is unrated, not a 5");
  for (const v of [APPEAL_MIN, 2, APPEAL_DEFAULT, 4, APPEAL_MAX]) assert.ok(appealLevel(v).label.length > 0);
});

test("the boost rises with the rating, in equal steps", () => {
  const boosts = [1, 2, 3, 4, 5].map(appealBoost);
  for (let i = 1; i < boosts.length; i++) assert.ok(boosts[i] > boosts[i - 1], "monotonic");
  for (let i = 2; i < boosts.length; i++) {
    close(boosts[i] - boosts[i - 1], boosts[1] - boosts[0], 1e-12, "no step is worth more than another");
  }
});

test("a question the creator rated highly outranks an equal one they did not", () => {
  const great = scoreCandidate(candidate({ id: "great", appeal: 5 }), EMPTY_TASTE, NOW);
  const plain = scoreCandidate(candidate({ id: "plain" }), EMPTY_TASTE, NOW);
  const filler = scoreCandidate(candidate({ id: "filler", appeal: 1 }), EMPTY_TASTE, NOW);
  assert.ok(great.score > plain.score && plain.score > filler.score);
  close(great.score - plain.score, APPEAL_WEIGHT, 1e-12, "the full weight separates them");
  assert.equal(plain.appeal, APPEAL_DEFAULT, "an unrated candidate reports the neutral value");
});

test("the rating is significant: it outweighs a real popularity gap, but not taste", () => {
  // a brand new question nobody has traded still beats a moderately busy plain one
  const fresh = scoreCandidate(candidate({ id: "fresh", appeal: 5, popularity: 0 }), EMPTY_TASTE, NOW);
  const busy = scoreCandidate(candidate({ id: "busy", popularity: 0.7 }), EMPTY_TASTE, NOW);
  assert.ok(fresh.score > busy.score, `${fresh.score} should beat ${busy.score}`);
  // ...but the board's runaway hit still wins, and so does what the user actually trades
  const hottest = scoreCandidate(candidate({ id: "hottest", popularity: 1 }), EMPTY_TASTE, NOW);
  assert.ok(hottest.score > scoreCandidate(candidate({ id: "good", appeal: 4 }), EMPTY_TASTE, NOW).score);
  const profile = buildTaste(
    Array.from({ length: 8 }, (_, i) => ev({ marketId: `m${i}`, category: "legal", people: ["netanyahu"] })),
    NOW,
  );
  const mine = scoreCandidate(candidate({ id: "mine", category: "legal", people: ["netanyahu"] }), profile, NOW);
  const theirs = scoreCandidate(candidate({ id: "theirs", category: "media", appeal: 5 }), profile, NOW);
  assert.ok(mine.score > theirs.score, "a great question in a topic they never touch is still not their question");
});

test("a highly rated question says so, and only from 4 up", () => {
  const labels = (appeal: number) => scoreCandidate(candidate({ appeal }), EMPTY_TASTE, NOW).reasons.map((r) => r.label);
  assert.ok(scoreCandidate(candidate({ appeal: 5 }), EMPTY_TASTE, NOW).reasons.some((r) => r.kind === "appeal"));
  assert.ok(scoreCandidate(candidate({ appeal: 4 }), EMPTY_TASTE, NOW).reasons.some((r) => r.kind === "appeal"));
  for (const dull of [1, 2, 3]) {
    assert.ok(!scoreCandidate(candidate({ appeal: dull }), EMPTY_TASTE, NOW).reasons.some((r) => r.kind === "appeal"));
  }
  assert.notDeepEqual(labels(5), labels(4), "the top of the scale is worded more strongly than the step below");
});

test("the rating never rewrites the board on its own: order without it is still order", () => {
  // every candidate rated the same ranks exactly as an unrated board would
  const rank = (appeal: number) =>
    [
      candidate({ id: "a", popularity: 0.9, appeal }),
      candidate({ id: "b", popularity: 0.5, appeal, closesAt: NOW + 6 * 3_600_000 }),
      candidate({ id: "c", popularity: 0.1, appeal }),
    ]
      .map((c) => scoreCandidate(c, EMPTY_TASTE, NOW))
      .sort((x, y) => y.score - x.score)
      .map((s) => s.id);
  assert.deepEqual(rank(1), rank(APPEAL_DEFAULT));
  assert.deepEqual(rank(5), rank(APPEAL_DEFAULT));
});

/* ------------------------------- topicality -------------------------------- */

const HOUR = 3_600_000;

test("the news scale folds anything onto 1..5, and an evergreen question is neutral", () => {
  close(topicalityBoost(TOPICALITY_DEFAULT, NOW, NOW), 0, 1e-12, "the default contributes nothing");
  close(topicalityBoost(undefined, NOW, NOW), 0, 1e-12, "neither does a missing rating");
  close(topicalityBoost(null, NOW, NOW), 0, 1e-12);
  close(topicalityBoost(NaN, NOW, NOW), 0, 1e-12, "and neither does a broken one");
  close(topicalityBoost(TOPICALITY_MAX, NOW, NOW), TOPICALITY_WEIGHT, 1e-12, "a brand new 5 is the full weight");
  close(topicalityBoost(99, NOW, NOW), TOPICALITY_WEIGHT, 1e-12, "off-scale is clamped, not extrapolated");
  assert.equal(clampTopicality(4.4), 4, "a rating is an integer step on the scale");
  assert.equal(clampTopicality("5" as unknown as number), TOPICALITY_DEFAULT, "a non-number is unrated, not a 5");
  for (const v of [TOPICALITY_MIN, 2, 3, 4, TOPICALITY_MAX]) assert.ok(topicalityLevel(v).label.length > 0);
});

test("the boost is never negative: an evergreen question is not punished for being one", () => {
  for (const age of [0, 12, 36, 24 * 30]) {
    for (const v of [1, 2, 3, 4, 5]) {
      assert.ok(topicalityBoost(v, NOW - age * HOUR, NOW) >= 0, `level ${v} at ${age}h`);
    }
  }
});

test("the push is at its strongest on publication and halves every half-life", () => {
  const at = (hours: number) => topicalityBoost(5, NOW - hours * HOUR, NOW);
  close(at(0), TOPICALITY_WEIGHT, 1e-12, "the first moment is the full weight");
  close(at(TOPICALITY_HALF_LIFE_HOURS), TOPICALITY_WEIGHT / 2, 1e-9, "half of it, one half-life later");
  close(at(2 * TOPICALITY_HALF_LIFE_HOURS), TOPICALITY_WEIGHT / 4, 1e-9, "and a quarter after two");
  for (let h = 1; h <= 24 * 10; h += 7) assert.ok(at(h) < at(h - 1), "strictly falling, every hour of the way");
  assert.ok(at(24 * 7) < 0.1, "a week on, the news hook is noise");
  close(topicalityDecay(NOW + 5 * HOUR, NOW), 1, 1e-12, "a market dated in the future is new, not more than new");
});

test("a higher rating outranks a lower one at every age — the decay never inverts the editor's order", () => {
  for (const hours of [0, 6, 36, 72, 24 * 7]) {
    const createdAt = NOW - hours * HOUR;
    const heats = [1, 2, 3, 4, 5].map((v) => topicalityHeat(v, createdAt, NOW));
    for (let i = 1; i < heats.length; i++) assert.ok(heats[i] > heats[i - 1] || heats[i - 1] === 0, `at ${hours}h`);
  }
});

test("a question written for tonight's news beats a busy one, and stops beating it in a few days", () => {
  const breaking = (hours: number) => candidate({ id: "breaking", topicality: 5, createdAt: NOW - hours * HOUR, popularity: 0 });
  const busy = candidate({ id: "busy", popularity: 0.8, createdAt: NOW - 30 * DAY });
  const busyScore = scoreCandidate(busy, EMPTY_TASTE, NOW).score;
  assert.ok(
    scoreCandidate(breaking(0.5), EMPTY_TASTE, NOW).score > busyScore,
    "a question published half an hour ago is what the visitor should see first",
  );
  assert.ok(
    scoreCandidate(breaking(24 * 6), EMPTY_TASTE, NOW).score < busyScore,
    "six days later the same question is just another question",
  );
});

test("the news rating and the quality rating are different claims", () => {
  const now = scoreCandidate(candidate({ id: "now", topicality: 5, createdAt: NOW }), EMPTY_TASTE, NOW);
  const good = scoreCandidate(candidate({ id: "good", appeal: 5, createdAt: NOW }), EMPTY_TASTE, NOW);
  assert.equal(now.appeal, APPEAL_DEFAULT, "rating a question topical says nothing about how good it is");
  assert.equal(good.topicality, TOPICALITY_DEFAULT, "and rating it good says nothing about the news");
  assert.ok(now.score > good.score, "in its first hour the news hook is the stronger of the two");
  const old = { createdAt: NOW - 4 * DAY };
  assert.ok(
    scoreCandidate(candidate({ id: "was-news", topicality: 5, ...old }), EMPTY_TASTE, NOW).score <
      scoreCandidate(candidate({ id: "still-good", appeal: 5, ...old }), EMPTY_TASTE, NOW).score,
    "four days on, being a good question outlasts having been the news",
  );
});

test("a hot question says why it is there, and a cooled one stops saying it", () => {
  const kinds = (topicality: number, hours: number) =>
    scoreCandidate(candidate({ topicality, createdAt: NOW - hours * HOUR }), EMPTY_TASTE, NOW).reasons.map((r) => r.kind);
  assert.ok(kinds(5, 0).includes("topical"), "a question published now, off the news");
  assert.ok(!kinds(5, 24 * 5).includes("topical"), "the same question five days later");
  assert.ok(!kinds(1, 0).includes("topical"), "an evergreen question never claims to be the news");
  const labels = (hours: number) =>
    scoreCandidate(candidate({ topicality: 5, createdAt: NOW - hours * HOUR }), EMPTY_TASTE, NOW).reasons.find(
      (r) => r.kind === "topical",
    )?.label;
  assert.notEqual(labels(0), labels(40), "still-breaking and merely-recent are not worded the same");
});

test("the news rating never rewrites the board on its own: order without it is still order", () => {
  const rank = (topicality: number) =>
    [
      candidate({ id: "a", popularity: 0.9, topicality }),
      candidate({ id: "b", popularity: 0.5, topicality, closesAt: NOW + 6 * HOUR }),
      candidate({ id: "c", popularity: 0.1, topicality }),
    ]
      .map((c) => scoreCandidate(c, EMPTY_TASTE, NOW))
      .sort((x, y) => y.score - x.score)
      .map((s) => s.id);
  assert.deepEqual(rank(1), rank(TOPICALITY_DEFAULT), "every candidate unrated");
  assert.deepEqual(rank(5), rank(TOPICALITY_DEFAULT), "and every candidate rated the same, all published together");
});

/* --------------------------------- survey ---------------------------------- */

test("an empty or skipped survey leaves the profile untouched", () => {
  const base = buildTaste([ev({ category: "legal" })], NOW);
  assert.deepEqual(withSurvey(base, null), base);
  assert.deepEqual(withSurvey(base, prefs({ status: "skipped" })), base);
  assert.deepEqual(withSurvey(base, prefs()), base, "picking nothing at all is not a signal");
});

test("survey answers give a brand new account a profile to rank by", () => {
  const p = withSurvey(EMPTY_TASTE, prefs({ topics: ["polls"], people: ["yair-golan"], horizon: "fast" }));
  close(p.categories.polls, SURVEY_CATEGORY_AFFINITY, 1e-9, "category affinity");
  close(p.people["yair-golan"], SURVEY_PERSON_AFFINITY, 1e-9, "person affinity");
  close(p.strength, 2 * SURVEY_STRENGTH_PER_PICK, 1e-9, "strength");
  assert.equal(p.markets, 0, "a survey answer is not a market the user acted on");
  assert.deepEqual(p.survey?.topics, ["polls"]);
  assert.equal(p.survey?.horizon, "fast");
  assert.ok(EMPTY_TASTE.strength === 0 && !EMPTY_TASTE.survey, "EMPTY_TASTE is not mutated");
});

test("the survey can only raise a dimension, never lower an earned one", () => {
  const traded = buildTaste([ev({ category: "polls", people: ["yair-golan"], weight: 1 })], NOW);
  close(traded.categories.polls, 1, 1e-9, "a lone traded category is the profile's own top");
  const p = withSurvey(traded, prefs({ topics: ["polls", "legal"] }));
  close(p.categories.polls, 1, 1e-9, "trading outranks ticking a box");
  close(p.categories.legal, SURVEY_CATEGORY_AFFINITY, 1e-9, "the untraded pick still enters");
});

test("survey strength is capped below a full trading history", () => {
  const many = prefs({ topics: ["polls", "legal", "media", "knesset", "haredi", "security"], people: ["a", "b", "c", "d"] });
  const p = withSurvey(EMPTY_TASTE, many);
  close(p.strength, SURVEY_MAX_STRENGTH, 1e-9, "capped");
  assert.ok(SURVEY_MAX_STRENGTH < MATURITY_EVENTS, "a survey is never worth as much as real trading");
  const w = blendWeights(p.strength);
  assert.ok(w.taste > 0, "a survey buys real personal weight");
  assert.ok(w.taste < blendWeights(MATURITY_EVENTS).taste, "but less than a mature profile");
});

test("survey affinities survive the inverse-frequency correction and the recency decay", () => {
  const p = focusProfile(withSurvey(EMPTY_TASTE, prefs({ topics: ["polls"], people: ["yair-golan"] })), {
    people: { "yair-golan": 0.1 },
    tags: {},
    size: 100,
  });
  assert.ok(p.people["yair-golan"] > 0, "a survey pick is still there after damping");
  // re-applied at full value however much later: an answer is a standing statement
  const later = withSurvey(buildTaste([], NOW + 400 * DAY), prefs({ topics: ["polls"] }));
  close(later.categories.polls, SURVEY_CATEGORY_AFFINITY, 1e-9, "no decay");
});

test("horizonFit nudges by the pace the user asked for, and never more than urgency", () => {
  const soon = NOW + 12 * 3_600_000;
  const far = NOW + 60 * DAY;
  assert.ok(horizonFit(soon, NOW, "fast") > 0, "fast likes a question closing tonight");
  assert.ok(horizonFit(far, NOW, "fast") < 0, "and dislikes one closing in two months");
  assert.ok(horizonFit(far, NOW, "long") > 0, "long is the mirror image");
  assert.ok(horizonFit(soon, NOW, "long") < 0);
  for (const h of ["fast", "long"] as const) {
    for (const t of [soon, NOW + 5 * DAY, far]) {
      assert.ok(Math.abs(horizonFit(t, NOW, h)) <= 0.4, "the nudge stays well under the 0.9 urgency term");
    }
  }
  assert.equal(horizonFit(soon, NOW, "mixed"), 0);
  assert.equal(horizonFit(soon, NOW, undefined), 0, "no survey means no horizon term");
});

test("a survey-driven pick is explained as an answer, not as activity", () => {
  const p = withSurvey(EMPTY_TASTE, prefs({ topics: ["polls"], people: ["yair-golan"] }));
  const reasons = scoreCandidate(candidate({ category: "polls", people: ["yair-golan"] }), p, NOW).reasons;
  const labels = reasons.map((r) => r.label).join(" | ");
  assert.ok(labels.includes("בשאלון"), `expected a survey wording, got: ${labels}`);
  assert.ok(!labels.includes("אתם פעילים"), "nobody who never traded is 'active' in a category");

  const traded = buildTaste([ev({ category: "polls", weight: 1 })], NOW);
  const tradedLabels = scoreCandidate(candidate({ category: "polls" }), traded, NOW).reasons.map((r) => r.label);
  assert.ok(tradedLabels.some((l) => l.includes("אתם פעילים")), "a traded category keeps its own wording");
});

test("a survey answer actually moves a question up the ranking", () => {
  const p = withSurvey(EMPTY_TASTE, prefs({ topics: ["haredi"] }));
  const mine = candidate({ id: "mine", category: "haredi" });
  const other = candidate({ id: "other", category: "media" });
  assert.ok(
    scoreCandidate(mine, p, NOW).score > scoreCandidate(other, p, NOW).score,
    "the chosen topic wins when everything else is equal",
  );
  // ...but popularity and urgency still count for something
  const hot = candidate({ id: "hot", category: "media", popularity: 1, closesAt: NOW + 6 * 3_600_000 });
  assert.ok(scoreCandidate(hot, p, NOW).score > scoreCandidate(mine, p, NOW).score, "the survey is a nudge, not a filter");
});

console.log(`recommendations: ${passed} tests passed`);
