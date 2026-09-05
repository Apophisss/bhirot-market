/**
 * השאלון הפוליטי הקצר.
 *
 * Dependency-free leaf module (like `rapid.ts` and `limits.ts`) so the survey form
 * and the recommendation engine share the same constants without pulling the
 * database client into the browser bundle. The queries live in `preferences-store.ts`,
 * and the scoring that uses the answers lives in `recommendations.ts` — the survey
 * does not get a ranking of its own, it seeds the one that already exists.
 *
 * Why it exists: `recommendations.ts` blends personal taste with board popularity,
 * and weights the personal half by how much the user's own trades have already said
 * (`blendWeights`). A brand new account has said nothing, so without the survey the
 * first board is pure popularity. Three questions are enough to fix that.
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

/** A skipped survey, or one where nothing was picked, carries no signal to rank by. */
export function hasSignal(p: UserPreferences | null | undefined): p is UserPreferences {
  return Boolean(p && (p.topics.length > 0 || p.people.length > 0 || p.horizon !== "mixed"));
}
