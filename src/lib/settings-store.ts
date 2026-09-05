import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import {
  DEFAULT_SETTINGS,
  parseRapidSort,
  sanitizeSettings,
  type SettingsPatch,
  type UserSettings,
} from "./settings";
import { clampStake } from "./rapid";

const { userSettings } = schema;

/**
 * הקריאה והכתיבה של `user_setting`. אותה חלוקה כמו בשאלון: `settings.ts` הוא
 * מודול העלה שהדפדפן גם קורא, וכאן נמצא המסד.
 *
 * NULL בעמודה = "עוד לא בחר", ולכן כל המרה משורה עוברת דרך ברירות המחדל של
 * `settings.ts`, ולא דרך ברירת מחדל של SQL: כך "20 כי זו ברירת המחדל" ו-"20 כי
 * זה מה שנבחר" נשארים שני דברים שונים — וזה בדיוק ההבדל שמכריע מה קורה כשאורח
 * מתחבר (ראו `claimSettings`).
 */

type Row = typeof userSettings.$inferSelect;

function fromRow(row: Row | undefined): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    rapidStake: row.rapidStake != null ? clampStake(row.rapidStake) : DEFAULT_SETTINGS.rapidStake,
    rapidSort: parseRapidSort(row.rapidSort) ?? DEFAULT_SETTINGS.rapidSort,
    rapidIncludeAnswered: row.rapidIncludeAnswered ?? DEFAULT_SETTINGS.rapidIncludeAnswered,
    surveySnoozedUntil: row.surveySnoozedUntil?.getTime() ?? DEFAULT_SETTINGS.surveySnoozedUntil,
  };
}

/** רק העמודות שהשינוי באמת נוגע בהן — מפתח שלא נשלח לא נדרס. */
function toColumns(patch: SettingsPatch) {
  const cols: Partial<Row> = {};
  if (patch.rapidStake != null) cols.rapidStake = patch.rapidStake;
  if (patch.rapidSort != null) cols.rapidSort = patch.rapidSort;
  if (patch.rapidIncludeAnswered != null) cols.rapidIncludeAnswered = patch.rapidIncludeAnswered;
  if (patch.surveySnoozedUntil != null) {
    // אפס הוא "לא מושתק", והדרך לומר את זה בשורה היא NULL — לא חותמת זמן של 1970
    cols.surveySnoozedUntil = patch.surveySnoozedUntil > 0 ? new Date(patch.surveySnoozedUntil) : null;
  }
  return cols;
}

/**
 * ההגדרות של המשתמש הזה. לאורח (ואין כאן חשבון) — ברירות המחדל, כי אין שום דבר
 * לשמור עליו בשרת; הדפדפן שלו מטפל בעצמו (`settings-client.ts`).
 */
export async function getSettings(userId: string | null | undefined): Promise<UserSettings> {
  if (!userId) return { ...DEFAULT_SETTINGS };
  const db = await getDb();
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  return fromRow(row);
}

/** שומר שינוי ומחזיר את התמונה המלאה אחריו. */
export async function saveSettings(userId: string, input: SettingsPatch | unknown): Promise<UserSettings> {
  const patch = sanitizeSettings(input);
  const cols = toColumns(patch);
  if (!Object.keys(cols).length) return getSettings(userId);

  const db = await getDb();
  const now = new Date();
  await db
    .insert(userSettings)
    .values({ userId, ...cols, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: userSettings.userId, set: { ...cols, updatedAt: now } });
  return getSettings(userId);
}

/**
 * מאמץ לחשבון את מה שנבחר לפני שהיה חשבון.
 *
 * אורח שהזיז את הסליידר ל-₪50 ואז התחבר בחר בחירה אמיתית, ואין סיבה שהיא תלך
 * לאיבוד ברגע שנוצר החשבון — אבל גם אין סיבה שהיא תדרוס בחירה מאוחרת יותר של
 * אותו חשבון ממכשיר אחר. לכן זו כתיבה שממלאת רק את מה שעוד לא נבחר (NULL),
 * ולא מעדכנת כלום מעבר לזה.
 */
export async function claimSettings(userId: string, input: SettingsPatch | unknown): Promise<UserSettings> {
  const patch = sanitizeSettings(input);
  if (!Object.keys(patch).length) return getSettings(userId);

  const db = await getDb();
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  const unset: SettingsPatch = {};
  if (row?.rapidStake == null && patch.rapidStake != null) unset.rapidStake = patch.rapidStake;
  if (row?.rapidSort == null && patch.rapidSort != null) unset.rapidSort = patch.rapidSort;
  if (row?.rapidIncludeAnswered == null && patch.rapidIncludeAnswered != null) {
    unset.rapidIncludeAnswered = patch.rapidIncludeAnswered;
  }
  if (!Object.keys(unset).length) return fromRow(row);
  return saveSettings(userId, unset);
}
