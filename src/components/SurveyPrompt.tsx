import Link from "next/link";
import { skipSurvey } from "@/app/onboarding/actions";

/**
 * Shown to a signed-in user who has not answered the short survey yet — the people who
 * were already registered when it shipped, or anyone who reached the board without
 * passing through the login redirect. "לא עכשיו" records a skip, so it appears once.
 */
export function SurveyPrompt({ next = "/" }: { next?: string }) {
  const href = next === "/" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(next)}`;
  return (
    <section className="card flex flex-col gap-3 border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-bold text-text-strong sm:text-base">שאלון קצר — ונדע מה להמליץ לכם</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted sm:text-sm">
          שלוש שאלות כלליות: אילו נושאים, אילו מתמודדים ואיזה קצב. לפי זה נסדר לכם את השאלות וההימורים
          המומלצים בלוח ובמצב הזריז. פחות מדקה, ואפשר לדלג.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={href}
          className="tap pressable inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
        >
          לשאלון
        </Link>
        <form action={skipSurvey}>
          <button className="tap pressable rounded-xl border border-border px-3.5 py-2.5 text-sm font-semibold text-muted hover:text-text-strong">
            לא עכשיו
          </button>
        </form>
      </div>
    </section>
  );
}
