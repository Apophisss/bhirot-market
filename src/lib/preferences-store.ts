import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { CATEGORY_IDS } from "./categories";
import { getPerson } from "./content";
import {
  MAX_PEOPLE,
  MAX_TOPICS,
  SURVEY_VERSION,
  parseHorizon,
  type Horizon,
  type SurveyStatus,
  type UserPreferences,
} from "./preferences";

const { userPreferences } = schema;

function parseIds(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** What the survey knows about this user, or null if they were never asked. */
export async function getPreferences(userId: string | null | undefined): Promise<UserPreferences | null> {
  if (!userId) return null;
  const db = await getDb();
  const row = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) });
  if (!row) return null;
  return {
    topics: parseIds(row.topics),
    people: parseIds(row.people),
    horizon: parseHorizon(row.horizon),
    status: row.status,
    version: row.version,
  };
}

/**
 * עד לתאריך הזה, "לא עכשיו" שעל גבי הלוח נשמר כדילוג קבוע במסד — משתמש ותיק שרק דחה
 * את ההצעה נשאר בלי שאלון לתמיד, מכפתור שכתוב עליו "לא עכשיו". הדילוגים שנרשמו לפני
 * המעבר נפתחים שוב פעם אחת. מכאן ואילך דחייה נשמרת בעוגייה לשבוע (survey-offer.ts),
 * ורק דילוג מתוך השאלון עצמו ("תראו לי הכול") נשמר כתשובה.
 */
export const REOFFER_SKIPS_BEFORE = Date.UTC(2026, 8, 5, 13, 0); // 5.9.2026, רגע המעבר

/**
 * Whether to put the survey in front of this user. A completed answer settles it until
 * the questions change (`SURVEY_VERSION`); a skip settles it too, except for the old
 * ones described above.
 */
export async function needsSurvey(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const db = await getDb();
  const row = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) });
  if (!row) return true;
  if (row.version < SURVEY_VERSION) return true;
  return row.status === "skipped" && row.updatedAt.getTime() < REOFFER_SKIPS_BEFORE;
}

/** Drops anything that is not a real category / person id, and caps the list length. */
export function sanitizeTopics(ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => CATEGORY_IDS.includes(id)).slice(0, MAX_TOPICS);
}

export function sanitizePeople(ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => Boolean(getPerson(id))).slice(0, MAX_PEOPLE);
}

export async function savePreferences(
  userId: string,
  input: { topics?: string[]; people?: string[]; horizon?: Horizon | string; status?: SurveyStatus },
): Promise<UserPreferences> {
  const db = await getDb();
  const value = {
    topics: sanitizeTopics(input.topics ?? []),
    people: sanitizePeople(input.people ?? []),
    horizon: parseHorizon(input.horizon),
    status: input.status === "skipped" ? ("skipped" as const) : ("completed" as const),
    version: SURVEY_VERSION,
  };
  const now = new Date();
  await db
    .insert(userPreferences)
    .values({
      userId,
      topics: JSON.stringify(value.topics),
      people: JSON.stringify(value.people),
      horizon: value.horizon,
      status: value.status,
      version: value.version,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        topics: JSON.stringify(value.topics),
        people: JSON.stringify(value.people),
        horizon: value.horizon,
        status: value.status,
        version: value.version,
        updatedAt: now,
      },
    });
  return value;
}
