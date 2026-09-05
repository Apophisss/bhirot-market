import { cookies } from "next/headers";
import { needsSurvey } from "./preferences-store";

/**
 * מי רואה את ההצעה למלא את השאלון.
 *
 * `needsSurvey` (preferences-store) עונה על "יש כבר תשובה שמורה?". כאן נוסף השכבה
 * השנייה: מתי מותר להטריד עם ההצעה. הרוב המכריע של המשתמשים שאין להם תשובה הם אנשים
 * שנרשמו לפני שהשאלון עלה — הם לא עוברים דרך ההפניה שבהתחברות, ולכן ההצעה על גבי הדפים
 * היא הדרך היחידה שלהם להגיע אליו.
 *
 * "לא עכשיו" לא נחשב תשובה: הוא רק משתיק את ההצעה לשבוע (עוגייה), כדי שהקשה אחת לא
 * תמחק את השאלון לתמיד ממשתמש ותיק. דילוג אמיתי ומחייב נמצא בתוך השאלון עצמו
 * ("דילוג — תראו לי הכול"), והוא נשמר במסד כמו כל תשובה אחרת.
 */
export const SURVEY_SNOOZE_COOKIE = "bm_survey_later";
export const SURVEY_SNOOZE_DAYS = 7;

export function surveySnoozeOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SURVEY_SNOOZE_DAYS * 24 * 60 * 60,
  };
}

/** "לא עכשיו" — משתיק את ההצעה לשבוע, בלי לכתוב תשובה במסד. */
export async function snoozeSurveyPrompt(): Promise<void> {
  const jar = await cookies();
  jar.set(SURVEY_SNOOZE_COOKIE, "1", surveySnoozeOptions());
}

/** האם להציג את ההצעה למשתמש הזה בדף שמתרנדר עכשיו. */
export async function shouldOfferSurvey(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const jar = await cookies();
  if (jar.get(SURVEY_SNOOZE_COOKIE)) return false;
  return needsSurvey(userId);
}
