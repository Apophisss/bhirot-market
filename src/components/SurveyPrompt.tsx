import Link from "next/link";
import { snoozeSurvey } from "@/app/onboarding/actions";

/**
 * ההצעה למלא את השאלון הקצר, למשתמש מחובר שאין לו תשובה שמורה — כלומר כמעט תמיד מי
 * שכבר היה רשום כשהשאלון עלה, או מי שהגיע ללוח בלי לעבור בהפניה שבהתחברות. מוצגת
 * בדף הבית, במצב הזריז ובתיק — שלושת המקומות שמשתמש ותיק חוזר אליהם.
 *
 * "לא עכשיו" דוחה לשבוע ולא נחשב תשובה (src/lib/survey-offer.ts), כדי שהקשה אחת לא
 * תסתיר את השאלון לתמיד. `next` מחזיר אותם לדף שממנו יצאו.
 *
 * `compact` היא השורה הצרה של מצב הזריז. במסך נמוך וצר (`short:`) היא יורדת יחד עם
 * שאר הכרום שם: החפיסה שם נמדדת בכך שהכרטיס נכנס במלואו, וההצעה תמיד תמתין בדף
 * הבית, בתיק ובתפריט המשתמש.
 */
export function SurveyPrompt({ next = "/", compact = false }: { next?: string; compact?: boolean }) {
  const href = next === "/" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(next)}`;

  if (compact) {
    return (
      <section className="flex shrink-0 items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-3 py-1.5 text-[13px] leading-snug short:hidden sm:py-2 sm:text-sm">
        <p className="min-w-0 flex-1 text-text">
          <span className="font-bold text-text-strong">שאלון קצר</span>{" "}
          <span className="hidden sm:inline">— שלוש שאלות, ונדע אילו שאלות להביא לכם ראשונות.</span>
          <span className="sm:hidden">— ונדע מה להביא לכם.</span>
        </p>
        <Link
          href={href}
          data-evt="survey-prompt-open"
          className="tap pressable shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-bold text-white hover:bg-accent-2"
        >
          לשאלון
        </Link>
        <form action={snoozeSurvey} className="shrink-0">
          <button
            data-evt="survey-prompt-later"
            aria-label="לא עכשיו"
            className="tap pressable rounded-lg px-2 py-1.5 text-[13px] font-semibold text-muted hover:text-text-strong"
          >
            לא עכשיו
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-3 border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-bold text-text-strong sm:text-base">שאלון קצר — ונדע מה להמליץ לכם</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted sm:text-sm">
          שלוש שאלות כלליות: אילו נושאים, אילו מתמודדים ואיזה קצב. לפי זה נסדר לכם את השאלות המומלצות
          בלוח ובמצב הזריז. פחות מדקה, ואפשר לדלג.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={href}
          data-evt="survey-prompt-open"
          className="tap pressable inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
        >
          לשאלון
        </Link>
        <form action={snoozeSurvey}>
          <button
            data-evt="survey-prompt-later"
            className="tap pressable rounded-xl border border-border px-3.5 py-2.5 text-sm font-semibold text-muted hover:text-text-strong"
          >
            לא עכשיו
          </button>
        </form>
      </div>
    </section>
  );
}
