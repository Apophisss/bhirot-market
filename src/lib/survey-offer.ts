import { cookies } from "next/headers";
import { needsSurvey } from "./preferences-store";
import { getSettings, saveSettings } from "./settings-store";
import { surveySnoozed } from "./settings";

/**
 * מי רואה את ההצעה למלא את השאלון.
 *
 * `needsSurvey` (preferences-store) עונה על "יש כבר תשובה שמורה?". כאן נוסף השכבה
 * השנייה: מתי מותר להטריד עם ההצעה. הרוב המכריע של המשתמשים שאין להם תשובה הם אנשים
 * שנרשמו לפני שהשאלון עלה — הם לא עוברים דרך ההפניה שבהתחברות, ולכן ההצעה על גבי הדפים
 * היא הדרך היחידה שלהם להגיע אליו.
 *
 * "לא עכשיו" לא נחשב תשובה: הוא רק משתיק את ההצעה לשבוע, כדי שהקשה אחת לא תמחק את
 * השאלון לתמיד ממשתמש ותיק. דילוג אמיתי ומחייב נמצא בתוך השאלון עצמו ("דילוג —
 * תראו לי הכול"), והוא נשמר במסד כמו כל תשובה אחרת.
 *
 * הדחייה נשמרה בעוגייה, כלומר בדפדפן אחד: מי שדחה בטלפון קיבל את אותה הצעה שוב
 * במחשב, ובכל דפדפן מחדש. היא נשמרת מעכשיו בחשבון (`user_setting.surveySnoozedUntil`),
 * כמו התשובות עצמן — ההצעה היא בין האתר למשתמש, לא בין האתר למכשיר.
 */
export const SURVEY_SNOOZE_DAYS = 7;

/**
 * העוגייה שבה נשמרה הדחייה עד 5.9.2026. כבר לא נכתבת — ועדיין נקראת, כדי שהמעבר
 * לא יעיר מחדש את ההצעה אצל מי שדחה אותה בימים שלפניו. אפשר להסיר את הקריאה
 * שבוע אחרי העלייה, כשכל דחייה כזאת ממילא פגה.
 */
export const SURVEY_SNOOZE_COOKIE = "bm_survey_later";

/** "לא עכשיו" — משתיק את ההצעה לשבוע בחשבון, בלי לכתוב תשובה לשאלון. */
export async function snoozeSurveyPrompt(userId: string): Promise<void> {
  await saveSettings(userId, { surveySnoozedUntil: Date.now() + SURVEY_SNOOZE_DAYS * 24 * 60 * 60 * 1000 });
}

/** האם להציג את ההצעה למשתמש הזה בדף שמתרנדר עכשיו. */
export async function shouldOfferSurvey(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const settings = await getSettings(userId);
  if (surveySnoozed(settings)) return false;
  const jar = await cookies();
  if (jar.get(SURVEY_SNOOZE_COOKIE)) return false;
  return needsSurvey(userId);
}
