/**
 * "מומלץ בשבילך" — the recommendation engine.
 *
 * Two signals, blended: what a user has shown they like (the categories, people
 * and tags they actually traded on) and what the board as a whole is doing right
 * now (recent money, recent traders, comments, lifetime volume). A signed-out
 * visitor gets pure popularity; the personal half fades in as the taste profile
 * fills up, so the list is never empty and never stale.
 *
 * A signed-in user who has not traded yet used to be in the same boat as a visitor.
 * The short survey (`preferences.ts`) is what fills that gap: its answers are folded
 * into the profile by `withSurvey` as a standing statement of interest — no recency
 * decay, capped well under a real trading history — so the very first board is
 * already theirs, and dilutes on its own as real trades accumulate.
 *
 * One ranking feeds both places the picks surface: the block on the home page
 * (`RecommendationSection`) and the default deck of rapid mode (`rapid-feed.ts`).
 *
 * The scoring itself is pure: `buildTaste`, `popularityScores`, `scoreCandidate`
 * and `diversify` take plain data and are covered by scripts/test-recommendations.ts.
 * Only the `get*` functions at the bottom touch the database.
 */
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getCategory } from "./categories";
import { getPerson } from "./content";
import { toView, type MarketView } from "./markets";
import { hasSignal, type Horizon, type UserPreferences } from "./preferences";
import { getPreferences } from "./preferences-store";

const { markets, trades, comments, positions } = schema;

/** A trade this old counts half as much as one made now. */
export const HALF_LIFE_DAYS = 14;
/** How many weighted signals a profile needs before it is trusted as much as it can be. */
export const MATURITY_EVENTS = 6;
/** The activity window that counts as "right now" for the popularity signal. */
export const TRENDING_WINDOW_HOURS = 72;
/** Above this affinity a dimension is strong enough to be worth telling the user about. */
const REASON_THRESHOLD = 0.34;

/**
 * What one survey answer is worth. The affinities sit just below 1 so a category the
 * user actually trades still outranks one they only ticked a box for, and the strength
 * is capped at half of `MATURITY_EVENTS`: a fresh survey buys about half the personal
 * weight that a fully-formed trading history does, and no more.
 */
export const SURVEY_CATEGORY_AFFINITY = 0.85;
export const SURVEY_PERSON_AFFINITY = 0.8;
export const SURVEY_STRENGTH_PER_PICK = 0.6;
export const SURVEY_MAX_STRENGTH = MATURITY_EVENTS / 2;

/* ---------------------------------- taste ---------------------------------- */

/** One thing the user did on one market — a trade, or a comment. */
export interface TasteEvent {
  marketId: string;
  category: string;
  people: string[];
  tags: string[];
  /** epoch ms, for the recency decay */
  at: number;
  /** how much this action says about them (a ₪500 trade says more than a ₪5 one) */
  weight: number;
}

/** The survey answers, kept alongside the affinities so the reasons can name their source. */
export interface SurveySignal {
  topics: string[];
  people: string[];
  horizon: Horizon;
}

export interface TasteProfile {
  /** 0..1 affinity per category id, normalized against the user's own top category */
  categories: Record<string, number>;
  people: Record<string, number>;
  tags: Record<string, number>;
  /** decayed sum of the event weights — how much this profile is worth trusting */
  strength: number;
  /** number of distinct markets the user acted on */
  markets: number;
  /** present once the short survey has been folded in (see `withSurvey`) */
  survey?: SurveySignal;
}

export const EMPTY_TASTE: TasteProfile = { categories: {}, people: {}, tags: {}, strength: 0, markets: 0 };

function decay(at: number, now: number): number {
  const days = Math.max(0, (now - at) / 86_400_000);
  return 0.5 ** (days / HALF_LIFE_DAYS);
}

function normalize(raw: Record<string, number>): Record<string, number> {
  const max = Math.max(0, ...Object.values(raw));
  if (max <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = v / max;
  return out;
}

/** Folds a user's actions into per-category / per-person / per-tag affinities in 0..1. */
export function buildTaste(events: TasteEvent[], now = Date.now()): TasteProfile {
  const categories: Record<string, number> = {};
  const people: Record<string, number> = {};
  const tags: Record<string, number> = {};
  let strength = 0;
  for (const e of events) {
    const w = e.weight * decay(e.at, now);
    if (!(w > 0)) continue;
    strength += w;
    categories[e.category] = (categories[e.category] ?? 0) + w;
    // a market with four people on it should not count four times as much as a solo one
    const share = e.people.length ? w / Math.sqrt(e.people.length) : 0;
    for (const p of e.people) people[p] = (people[p] ?? 0) + share;
    for (const t of e.tags) tags[t] = (tags[t] ?? 0) + w * 0.5;
  }
  return {
    categories: normalize(categories),
    people: normalize(people),
    tags: normalize(tags),
    strength,
    markets: new Set(events.map((e) => e.marketId)).size,
  };
}

/** The weight of one trade: a bigger stake is a stronger statement, but only logarithmically. */
export function tradeWeight(amount: number): number {
  return Math.min(2, Math.log10(1 + Math.max(0, amount)) / Math.log10(101));
}

/**
 * Folds the short survey into a profile built from real actions.
 *
 * Unlike a trade, an answer is a standing statement rather than an event, so it does
 * not decay: it is re-applied on every request at full value, and loses its hold only
 * because real trades push the profile's own maximum up around it. The affinities go
 * in with `max`, so an answer can only ever raise a dimension — a user who both ticked
 * "סקרים" and trades it heavily keeps the higher, earned number.
 */
export function withSurvey(profile: TasteProfile, prefs: UserPreferences | null | undefined): TasteProfile {
  if (!hasSignal(prefs)) return profile;
  const categories = { ...profile.categories };
  const people = { ...profile.people };
  for (const id of prefs.topics) categories[id] = Math.max(categories[id] ?? 0, SURVEY_CATEGORY_AFFINITY);
  for (const id of prefs.people) people[id] = Math.max(people[id] ?? 0, SURVEY_PERSON_AFFINITY);
  const picks = prefs.topics.length + prefs.people.length;
  return {
    ...profile,
    categories,
    people,
    strength: profile.strength + Math.min(SURVEY_MAX_STRENGTH, picks * SURVEY_STRENGTH_PER_PICK),
    survey: { topics: prefs.topics, people: prefs.people, horizon: prefs.horizon },
  };
}

/** How often each person and tag appears across the board, as a share of it. */
export interface BoardFrequencies {
  people: Record<string, number>;
  tags: Record<string, number>;
  size: number;
}

export function boardFrequencies(items: { people: string[]; tags: string[] }[]): BoardFrequencies {
  const people: Record<string, number> = {};
  const tags: Record<string, number> = {};
  for (const it of items) {
    for (const p of new Set(it.people)) people[p] = (people[p] ?? 0) + 1;
    for (const t of new Set(it.tags)) tags[t] = (tags[t] ?? 0) + 1;
  }
  const size = items.length || 1;
  for (const k of Object.keys(people)) people[k] /= size;
  for (const k of Object.keys(tags)) tags[k] /= size;
  return { people, tags, size: items.length };
}

/**
 * Netanyahu is on a third of the board, so "you traded a Netanyahu question" says
 * far less about a user than "you traded a Goldknopf question". This is the usual
 * inverse-frequency correction, kept deliberately gentle.
 */
export function commonnessDamp(share: number): number {
  return 1 / (1 + 4 * Math.min(1, Math.max(0, share)));
}

/**
 * Re-weights a profile against the board it will be used on, so an interest only
 * counts as taste to the extent that it actually singles questions out. Categories
 * are left alone: there are eleven of them and picking one is a real choice.
 */
export function focusProfile(profile: TasteProfile, freq: BoardFrequencies): TasteProfile {
  const damp = (raw: Record<string, number>, shares: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = v * commonnessDamp(shares[k] ?? 0);
    return normalize(out);
  };
  return {
    ...profile,
    people: damp(profile.people, freq.people),
    tags: damp(profile.tags, freq.tags),
  };
}

/* ------------------------------- popularity -------------------------------- */

export interface ActivityRow {
  marketId: string;
  recentAmount: number;
  recentTrades: number;
  recentTraders: number;
  recentComments: number;
}

export interface PopularityInput {
  id: string;
  volume: number;
}

/**
 * Per-market popularity in 0..1, normalized against the busiest market in the pool.
 * Each component is normalized on its own so a single whale trade cannot drown out
 * the "many different people are answering this" signal.
 */
export function popularityScores(pool: PopularityInput[], activity: ActivityRow[]): Map<string, number> {
  const byId = new Map(activity.map((a) => [a.marketId, a]));
  const parts = pool.map((m) => {
    const a = byId.get(m.id);
    return {
      id: m.id,
      amount: Math.log10(1 + (a?.recentAmount ?? 0)),
      traders: a?.recentTraders ?? 0,
      trades: a?.recentTrades ?? 0,
      comments: a?.recentComments ?? 0,
      lifetime: Math.log10(1 + Math.max(0, m.volume)),
    };
  });
  const max = (pick: (p: (typeof parts)[number]) => number) => Math.max(0, ...parts.map(pick));
  const maxes = {
    amount: max((p) => p.amount),
    traders: max((p) => p.traders),
    trades: max((p) => p.trades),
    comments: max((p) => p.comments),
    lifetime: max((p) => p.lifetime),
  };
  const ratio = (v: number, m: number) => (m > 0 ? v / m : 0);
  const out = new Map<string, number>();
  for (const p of parts) {
    out.set(
      p.id,
      0.4 * ratio(p.amount, maxes.amount) +
        0.25 * ratio(p.traders, maxes.traders) +
        0.1 * ratio(p.trades, maxes.trades) +
        0.05 * ratio(p.comments, maxes.comments) +
        0.2 * ratio(p.lifetime, maxes.lifetime),
    );
  }
  return out;
}

/* --------------------------------- scoring --------------------------------- */

export interface CandidateSignals {
  id: string;
  category: string;
  people: string[];
  tags: string[];
  probability: number;
  /** epoch ms */
  closesAt: number;
  createdAt: number;
  featured: boolean;
  /** 0..1, from popularityScores */
  popularity: number;
}

export type ReasonKind = "category" | "person" | "trending" | "closing" | "fresh" | "open";

export interface RecReason {
  kind: ReasonKind;
  label: string;
}

export interface ScoredCandidate {
  id: string;
  score: number;
  taste: number;
  popularity: number;
  reasons: RecReason[];
}

/** How much of the score personal taste is allowed to carry, given how much we know. */
export function blendWeights(strength: number): { taste: number; popularity: number } {
  const known = Math.min(1, strength / MATURITY_EVENTS);
  return { taste: 1.6 * known, popularity: 1.4 - 0.4 * known };
}

/** 0..1 — how close this market sits to what the user already trades. */
export function tasteAffinity(profile: TasteProfile, c: Pick<CandidateSignals, "category" | "people" | "tags">): number {
  const cat = profile.categories[c.category] ?? 0;
  const person = Math.max(0, ...c.people.map((p) => profile.people[p] ?? 0));
  const tag = Math.max(0, ...c.tags.map((t) => profile.tags[t] ?? 0));
  return Math.min(1, 0.5 * cat + 0.35 * person + 0.15 * tag);
}

/** A question that closes tonight is worth surfacing more than one that closes in April. */
function urgency(closesAt: number, now: number): number {
  const days = Math.max(0.25, (closesAt - now) / 86_400_000);
  return Math.min(1, 1 / Math.sqrt(days));
}

function freshness(createdAt: number, now: number): number {
  return Math.max(0, 1 - (now - createdAt) / (7 * 86_400_000));
}

/** A 50/50 question is a better invitation to trade than one the board treats as settled. */
function uncertainty(probability: number): number {
  return 1 - Math.abs(probability - 0.5) * 2;
}

const FAST_HOURS = 72;
const WEEK_HOURS = 24 * 7;
const FORTNIGHT_HOURS = 24 * 14;

/**
 * The pace the user asked for in the survey, as a nudge on top of `urgency`. Kept well
 * under it (±0.4 against 0.9) so it shades the order without ever hiding the board:
 * somebody who asked for long-range questions is still shown the one closing tonight.
 */
export function horizonFit(closesAt: number, now: number, horizon: Horizon | undefined): number {
  if (!horizon || horizon === "mixed") return 0;
  const hours = (closesAt - now) / 3_600_000;
  if (horizon === "fast") return hours <= FAST_HOURS ? 0.4 : hours <= WEEK_HOURS ? 0.1 : -0.25;
  return hours >= FORTNIGHT_HOURS ? 0.3 : hours >= WEEK_HOURS ? 0.1 : -0.2;
}

export function scoreCandidate(c: CandidateSignals, profile: TasteProfile, now = Date.now()): ScoredCandidate {
  const w = blendWeights(profile.strength);
  const taste = tasteAffinity(profile, c);
  const urge = urgency(c.closesAt, now);
  const fresh = freshness(c.createdAt, now);
  const score =
    w.taste * taste +
    w.popularity * c.popularity +
    0.9 * urge +
    0.5 * uncertainty(c.probability) +
    0.35 * fresh +
    horizonFit(c.closesAt, now, profile.survey?.horizon) +
    (c.featured ? 0.25 : 0);

  // a pick the user only ticked in the survey must not be explained as something they
  // "are active in" — a brand new account has never traded anything
  const surveyTopics = new Set(profile.survey?.topics ?? []);
  const surveyPeople = new Set(profile.survey?.people ?? []);
  const reasons: RecReason[] = [];
  const cat = profile.categories[c.category] ?? 0;
  if (cat >= REASON_THRESHOLD) {
    const label = getCategory(c.category).label;
    reasons.push({ kind: "category", label: surveyTopics.has(c.category) ? `בחרתם ${label} בשאלון` : `אתם פעילים ב${label}` });
  }
  let bestPerson = "";
  let bestPersonScore = 0;
  for (const p of c.people) {
    const v = profile.people[p] ?? 0;
    if (v > bestPersonScore) [bestPerson, bestPersonScore] = [p, v];
  }
  if (bestPersonScore >= REASON_THRESHOLD) {
    const name = getPerson(bestPerson)?.name ?? bestPerson;
    reasons.push({
      kind: "person",
      label: surveyPeople.has(bestPerson) ? `בחרתם את ${name} בשאלון` : `שאלות על ${name} מעניינות אתכם`,
    });
  }
  if (c.popularity >= 0.5) reasons.push({ kind: "trending", label: "נסחר הרבה עכשיו" });
  if (urge >= 0.7) reasons.push({ kind: "closing", label: "ההכרעה קרובה" });
  if (fresh >= 0.6) reasons.push({ kind: "fresh", label: "שאלה חדשה על הלוח" });
  if (!reasons.length) reasons.push({ kind: "open", label: "שאלה פתוחה שעוד לא עניתם עליה" });

  return { id: c.id, score, taste, popularity: c.popularity, reasons: reasons.slice(0, 2) };
}

/**
 * Greedy re-ranking that keeps one topic from taking over the row: every extra pick
 * from a category the list already carries is discounted before the next choice.
 */
export function diversify<T extends { id: string; score: number }>(
  scored: T[],
  categoryOf: (item: T) => string,
  limit: number,
  penalty = 0.6,
): T[] {
  const pool = [...scored];
  const picked: T[] = [];
  const used: Record<string, number> = {};
  while (picked.length < limit && pool.length) {
    let bestIdx = 0;
    let best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const seen = used[categoryOf(pool[i])] ?? 0;
      const adjusted = pool[i].score * penalty ** seen;
      if (adjusted > best) [best, bestIdx] = [adjusted, i];
    }
    const [item] = pool.splice(bestIdx, 1);
    used[categoryOf(item)] = (used[categoryOf(item)] ?? 0) + 1;
    picked.push(item);
  }
  return picked;
}

/* --------------------------------- database -------------------------------- */

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/**
 * What a user's own trades and comments say about the questions they like, with the
 * short survey folded in on top — that is what makes the profile non-empty on day one.
 */
export async function getTasteProfile(userId: string | null | undefined, now = Date.now()): Promise<TasteProfile> {
  if (!userId) return EMPTY_TASTE;
  const db = await getDb();
  const [tradeRows, commentRows, prefs] = await Promise.all([
    db
      .select({
        marketId: trades.marketId,
        amount: trades.amount,
        createdAt: trades.createdAt,
        category: markets.category,
        people: markets.people,
        tags: markets.tags,
      })
      .from(trades)
      .innerJoin(markets, eq(trades.marketId, markets.id))
      .where(eq(trades.userId, userId))
      .orderBy(desc(trades.createdAt))
      .limit(400),
    db
      .select({
        marketId: comments.marketId,
        createdAt: comments.createdAt,
        category: markets.category,
        people: markets.people,
        tags: markets.tags,
      })
      .from(comments)
      .innerJoin(markets, eq(comments.marketId, markets.id))
      .where(eq(comments.userId, userId))
      .orderBy(desc(comments.createdAt))
      .limit(100),
    getPreferences(userId),
  ]);

  const events: TasteEvent[] = [
    ...tradeRows.map((r) => ({
      marketId: r.marketId,
      category: r.category,
      people: parseJson<string[]>(r.people, []),
      tags: parseJson<string[]>(r.tags, []),
      at: r.createdAt.getTime(),
      weight: tradeWeight(Math.abs(r.amount)),
    })),
    // a comment is real interest, but it costs nothing — worth about a small trade
    ...commentRows.map((r) => ({
      marketId: r.marketId,
      category: r.category,
      people: parseJson<string[]>(r.people, []),
      tags: parseJson<string[]>(r.tags, []),
      at: r.createdAt.getTime(),
      weight: 0.35,
    })),
  ];
  return withSurvey(buildTaste(events, now), prefs);
}

/** Trading and commenting on every market inside the trending window. */
export async function getRecentActivity(sinceMs: number): Promise<ActivityRow[]> {
  const db = await getDb();
  const since = new Date(sinceMs);
  const [tradeRows, commentRows] = await Promise.all([
    db
      .select({
        marketId: trades.marketId,
        amount: sql<number>`coalesce(sum(abs(${trades.amount})), 0)`,
        n: sql<number>`count(*)`,
        traders: sql<number>`count(distinct ${trades.userId})`,
      })
      .from(trades)
      .where(gt(trades.createdAt, since))
      .groupBy(trades.marketId),
    db
      .select({ marketId: comments.marketId, n: sql<number>`count(*)` })
      .from(comments)
      .where(gt(comments.createdAt, since))
      .groupBy(comments.marketId),
  ]);
  const byId = new Map<string, ActivityRow>();
  for (const r of tradeRows) {
    byId.set(r.marketId, {
      marketId: r.marketId,
      recentAmount: r.amount ?? 0,
      recentTrades: r.n ?? 0,
      recentTraders: r.traders ?? 0,
      recentComments: 0,
    });
  }
  for (const r of commentRows) {
    const row = byId.get(r.marketId);
    if (row) row.recentComments = r.n ?? 0;
    else
      byId.set(r.marketId, {
        marketId: r.marketId,
        recentAmount: 0,
        recentTrades: 0,
        recentTraders: 0,
        recentComments: r.n ?? 0,
      });
  }
  return [...byId.values()];
}

/** Markets the user already answered — they do not need to be recommended again. */
async function getAnsweredIds(userId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select({ marketId: positions.marketId }).from(positions).where(eq(positions.userId, userId));
  return new Set(rows.map((r) => r.marketId));
}

export interface Recommendation {
  market: MarketView;
  score: number;
  /** 0..1 — how much of this pick came from the user's own history */
  taste: number;
  popularity: number;
  reasons: RecReason[];
}

export interface RecommendationOptions {
  userId?: string | null;
  limit?: number;
  category?: string;
  /** keep markets the user already traded (off by default) */
  includeAnswered?: boolean;
  /** exclude these market ids (e.g. the market currently on screen) */
  exclude?: string[];
  now?: number;
}

/** The candidate pool: open, still-tradable markets. Everything else is scored in JS. */
const POOL_LIMIT = 500;

export interface RecommendationResult {
  items: Recommendation[];
  profile: TasteProfile;
  /** true once the personal half of the blend actually carries weight */
  personalized: boolean;
}

export async function getRecommendations(opts: RecommendationOptions = {}): Promise<RecommendationResult> {
  const now = opts.now ?? Date.now();
  const limit = Math.min(opts.limit ?? 6, 60);
  const db = await getDb();

  const conds = [eq(markets.status, "open"), gt(markets.closesAt, new Date(now))];
  if (opts.category && opts.category !== "all") conds.push(eq(markets.category, opts.category));

  const [rows, rawProfile, answered] = await Promise.all([
    db
      .select()
      .from(markets)
      .where(and(...conds))
      .orderBy(desc(markets.volume), desc(markets.createdAt))
      .limit(POOL_LIMIT),
    getTasteProfile(opts.userId, now),
    opts.userId && !opts.includeAnswered ? getAnsweredIds(opts.userId) : Promise.resolve(new Set<string>()),
  ]);

  const excluded = new Set([...(opts.exclude ?? []), ...answered]);
  const pool = rows.filter((r) => !excluded.has(r.id));
  if (!pool.length) return { items: [], profile: rawProfile, personalized: false };

  const profile = focusProfile(
    rawProfile,
    boardFrequencies(pool.map((r) => ({ people: parseJson<string[]>(r.people, []), tags: parseJson<string[]>(r.tags, []) }))),
  );
  const activity = await getRecentActivity(now - TRENDING_WINDOW_HOURS * 3600_000);
  const popularity = popularityScores(
    pool.map((m) => ({ id: m.id, volume: m.volume })),
    activity,
  );

  const views = new Map<string, MarketView>();
  const scored = pool.map((r) => {
    const view = toView(r, now);
    views.set(r.id, view);
    return scoreCandidate(
      {
        id: r.id,
        category: view.category,
        people: view.people,
        tags: view.tags,
        probability: view.probability,
        closesAt: view.closesAt.getTime(),
        createdAt: view.createdAt.getTime(),
        featured: view.featured,
        popularity: popularity.get(r.id) ?? 0,
      },
      profile,
      now,
    );
  });

  scored.sort((a, b) => b.score - a.score);
  const picked = diversify(scored.slice(0, Math.max(limit * 5, 40)), (s) => views.get(s.id)!.category, limit);

  return {
    items: picked.map((s) => ({
      market: views.get(s.id)!,
      score: s.score,
      taste: s.taste,
      popularity: s.popularity,
      reasons: s.reasons,
    })),
    profile,
    personalized: profile.strength >= 1,
  };
}

/** The user's own top categories, reported by GET /api/recommendations. */
export function topCategories(profile: TasteProfile, limit = 3): { id: string; label: string; weight: number }[] {
  return Object.entries(profile.categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, weight]) => ({ id, label: getCategory(id).label, weight }));
}
