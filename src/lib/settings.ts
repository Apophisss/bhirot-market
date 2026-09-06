/**
 * ההגדרות של המשתמש — מה שהוא בחר באתר ואינו שייך למכשיר שבו בחר.
 *
 * הבחירות האלה נשמרו עד כה ב-`localStorage` בלבד, כלומר בדפדפן אחד: מי שבחר ₪50
 * לתשובה בטלפון וחזר מהמחשב קיבל שוב ₪20, ומי שסידר את החפיסה ל"נסגר בקרוב" מצא
 * במכשיר השני את סדר ברירת המחדל. כל השאר בחשבון — היתרה, הפוזיציות, התשובות
 * לשאלון — ולכן ההעדפות האלה הן החריגה, לא הכלל. מכאן ואילך הן נשמרות בחשבון
 * (`user_setting`), ו-`localStorage` נשאר מה שהוא באמת: המקום היחיד שיש לאורח.
 *
 * מודול עלה (כמו `rapid.ts` ו-`limits.ts`) — הוא הגבול המשותף בין הדפדפן לשרת,
 * ולכן אסור לו לגעת במסד: החנות עצמה נמצאת ב-`settings-store.ts`, וצד הדפדפן
 * ב-`settings-client.ts`. ברירות המחדל מוגדרות כאן פעם אחת, ולא ב-SQL, כדי
 * שהשרת, הדפדפן והמיגרציה לא יוכלו להיפרד זה מזה.
 */

import { RAPID_DEFAULT_STAKE, RAPID_SORTS, clampStake, type RapidSort } from "./rapid";

export interface UserSettings {
  /** הסכום שכל תשובה במצב זריז מחייבת, בנקודות */
  rapidStake: number;
  /** המיון שהחפיסה נפתחת בו */
  rapidSort: RapidSort;
  /** "כולל שאלות שכבר עניתי" */
  rapidIncludeAnswered: boolean;
  /**
   * עד מתי ההצעה למלא את השאלון מושתקת (epoch ms), 0 = לא מושתקת.
   * זמן ולא דגל: "לא עכשיו" הוא דחייה לשבוע, לא ויתור (`survey-offer.ts`).
   */
  surveySnoozedUntil: number;
}

/** מה שרואה מי שעוד לא בחר כלום — וגם מה שרואה אורח, שאין לו חשבון לשמור בו. */
export const DEFAULT_SETTINGS: UserSettings = {
  rapidStake: RAPID_DEFAULT_STAKE,
  rapidSort: "mix",
  rapidIncludeAnswered: false,
  surveySnoozedUntil: 0,
};

/**
 * שינוי חלקי. מפתח שאינו מופיע נשאר כפי שהוא — זה מה שמאפשר לסליידר לשמור סכום
 * בלי לגעת במיון, ולסינון להישמר בלי לגעת בשאלון.
 */
export type SettingsPatch = Partial<UserSettings>;

export function parseRapidSort(v: unknown): RapidSort | null {
  return RAPID_SORTS.some((s) => s.id === v) ? (v as RapidSort) : null;
}

/**
 * מנפה קלט (גוף בקשה, שורה במסד, ערך ישן ב-localStorage) לשינוי שמותר לשמור.
 *
 * מחזיר רק מפתחות מוכרים שהערך שלהם תקין — ערך פסול נשמט במקום להפיל את הבקשה
 * או לדרוס בחירה קיימת באפס. הסכום עובר את אותו `clampStake` שהסליידר עובר,
 * והוא ממילא נאכף שוב ב-`/api/rapid/answer`, שהוא היחיד שמחייב כסף.
 */
export function sanitizeSettings(input: unknown): SettingsPatch {
  const raw = (input ?? {}) as Record<string, unknown>;
  const patch: SettingsPatch = {};

  if (raw.rapidStake != null) {
    const n = Number(raw.rapidStake);
    if (Number.isFinite(n)) patch.rapidStake = clampStake(n);
  }
  const sort = parseRapidSort(raw.rapidSort);
  if (sort) patch.rapidSort = sort;
  if (typeof raw.rapidIncludeAnswered === "boolean") patch.rapidIncludeAnswered = raw.rapidIncludeAnswered;
  if (raw.surveySnoozedUntil != null) {
    const n = Number(raw.surveySnoozedUntil);
    if (Number.isFinite(n) && n >= 0) patch.surveySnoozedUntil = Math.round(n);
  }
  return patch;
}

/** האם ההצעה למלא את השאלון מושתקת עכשיו. */
export function surveySnoozed(settings: UserSettings, now: number = Date.now()): boolean {
  return settings.surveySnoozedUntil > now;
}
