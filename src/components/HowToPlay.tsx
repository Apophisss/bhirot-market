import Link from "next/link";
import { money } from "@/lib/format";
import { STARTING_BALANCE } from "@/lib/db/schema";

const STEPS = [
  { n: "1", emoji: "🔐", title: "מתחברים עם Google", body: `מקבלים ${money(STARTING_BALANCE)} וירטואליים. בלי כסף אמיתי, בלי הימורים.` },
  { n: "2", emoji: "🎯", title: "בוחרים שאלה", body: "קונים ״כן״ אם אתם חושבים שזה יקרה, ״לא״ אם לא. המחיר הוא ההסתברות." },
  { n: "3", emoji: "🏆", title: "מרוויחים אם צדקתם", body: "כל מניה מנצחת שווה ₪1. אפשר גם למכור לפני ההכרעה ולנעול רווח." },
];

export function HowToPlay() {
  return (
    <section className="card p-3.5 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-bold text-text-strong">איך מתחילים לשחק?</h2>
        <Link href="/about" className="-my-2 inline-flex items-center py-2 text-xs text-accent-2 hover:underline">
          המדריך המלא
        </Link>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-xl bg-surface-2 p-3">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-lg" aria-hidden>
              {s.emoji}
              <span className="absolute -bottom-1 -start-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {s.n}
              </span>
            </span>
            <div>
              <div className="text-sm font-bold text-text-strong">{s.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
