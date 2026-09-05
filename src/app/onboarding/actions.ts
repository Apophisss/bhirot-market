"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { snoozeSurveyPrompt } from "@/lib/survey-offer";

/**
 * "לא עכשיו" על גבי ההצעה למלא את השאלון. זו דחייה, לא תשובה: היא נשמרת בעוגייה
 * לשבוע (src/lib/survey-offer.ts) ולא כותבת שורה במסד, כדי שמשתמש שכבר רשום — מי
 * שלא עבר בהפניה שבהתחברות — יקבל את ההצעה שוב במקום לאבד אותה בהקשה אחת. דילוג
 * מחייב נמצא בתוך השאלון עצמו, והשאלון פתוח תמיד מתפריט המשתמש.
 */
export async function snoozeSurvey() {
  const session = await auth();
  if (!session?.user?.id) return;
  await snoozeSurveyPrompt();
  // ההצעה מופיעה בכמה דפים תחת אותו layout — לרענן את כולם, לא רק את דף הבית
  revalidatePath("/", "layout");
}
