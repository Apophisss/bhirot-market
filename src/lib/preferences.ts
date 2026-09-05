/**
 * השאלון הפוליטי הקצר וההמלצות שנגזרות ממנו.
 *
 * Dependency-free leaf module (like `rapid.ts` and `limits.ts`): the survey form,
 * the home page and the rapid feed all share the same weights without pulling the
 * database client into the browser bundle. The queries live in `preferences-store.ts`.
 *
 * The survey is deliberately tiny — three general questions, all skippable — and it
 * exists for one reason: a brand new user has no trading history, so without it the
 * first board they see is ranked by what everyone else is doing. With it, the first
 * recommendations are theirs.
 */

import type { Horizon, SurveyStatus } from "./db/schema";

export type { Horizon, SurveyStatus };

/**
 * Bump when the questions change in a way that makes an old answer stale — users
 * who answered an earlier revision get asked again (a skip still counts as an answer).
 */
export const SURVEY_VERSION = 1;

/** Nobody has to pick anything, but past a handful the answer stops discriminating. */
export const MAX_TOPICS = 6;
export const MAX_PEOPLE = 8;

export const HORIZONS: { id: Horizon; label: string; note: string }[] = [
  { id: "fast", label: "מהיר", note: "שאלות שנסגרות תוך יום־יומיים" },
  { id: "mixed", label: "מעורב", note: "קצת מהכול — ברירת המחדל" },
  { id: "long", label: "ארוך", note: "שאלות על הקמפיין ועל יום הבחירות" },
];

export function parseHorizon(v: unknown): Horizon {
  return HORIZONS.some((h) => h.id === v) ? (v as Horizon) : "mixed";
}

export interface UserPreferences {
  /** category ids from `categories.ts` */
  topics: string[];
  /** people ids from `data/people.json` */
  people: string[];
  horizon: Horizon;
  status: SurveyStatus;
  version: number;
}

/** The shape the scoring needs — every `MarketView` already satisfies it. */
export interface PersonalizableMarket {
  category: string;
  people: string[];
  closesAt: Date;
}

/** A skipped survey, or one where nothing was picked, carries no signal to rank by. */
export function hasSignal(p: UserPreferences | null | undefined): p is UserPreferences {
  return Boolean(p && (p.topics.length > 0 || p.people.length > 0 || p.horizon !== "mixed"));
}

const TOPIC_WEIGHT = 3;
const PERSON_WEIGHT = 4;
/** a market can name six people; two hits already say "this is about your candidates" */
const MAX_PERSON_HITS = 2;
const FAST_HOURS = 72;
const WEEK_HOURS = 24 * 7;
const FORTNIGHT_HOURS = 24 * 14;

/**
 * How well one market matches the survey. Same shape as the related-markets score
 * in `markets.ts` (category 3, person 4) so the two rankings feel consistent.
 * 0 means "nothing in the survey points at this market" — never a negative signal
 * on its own, only the horizon can push a match down.
 */
export function preferenceScore(
  m: PersonalizableMarket,
  p: UserPreferences | null | undefined,
  now = Date.now(),
): number {
  if (!hasSignal(p)) return 0;
  let score = 0;
  if (p.topics.includes(m.category)) score += TOPIC_WEIGHT;
  const hits = m.people.filter((id) => p.people.includes(id)).length;
  score += Math.min(hits, MAX_PERSON_HITS) * PERSON_WEIGHT;
  if (score === 0) return 0;

  const hours = (m.closesAt.getTime() - now) / 3_600_000;
  if (p.horizon === "fast") score += hours <= FAST_HOURS ? 2 : hours <= WEEK_HOURS ? 0.5 : -1;
  else if (p.horizon === "long") score += hours >= FORTNIGHT_HOURS ? 1.5 : hours >= WEEK_HOURS ? 0.5 : -1;
  return Math.max(0, score);
}

/** The markets the survey actually points at, best match first. */
export function rankByPreferences<T extends PersonalizableMarket>(
  list: T[],
  p: UserPreferences | null | undefined,
  limit = 6,
  now = Date.now(),
): T[] {
  if (!hasSignal(p)) return [];
  return list
    .map((m, i) => ({ m, i, score: preferenceScore(m, p, now) }))
    .filter((x) => x.score > 0)
    // ties keep the order the caller handed us (already sorted by trending/volume)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.m);
}

/**
 * The same signal as a small additive bonus, for feeds that already have a score of
 * their own (the rapid deck). Deliberately capped well under the urgency term there:
 * a preferred topic should reorder near-equal cards, not bury a question closing tonight.
 */
export const PREFERENCE_BOOST = 0.12;

export function preferenceBoost(
  m: PersonalizableMarket,
  p: UserPreferences | null | undefined,
  now = Date.now(),
): number {
  return preferenceScore(m, p, now) * PREFERENCE_BOOST;
}
