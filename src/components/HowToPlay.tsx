import Link from "next/link";
import { BoltIcon } from "./BoltIcon";
import { money } from "@/lib/format";
import { STARTING_BALANCE } from "@/lib/db/schema";

const STEPS = [
  { n: "1", title: "מתחברים עם Google", body: `מקבלים ${money(STARTING_BALANCE)}. אין כסף אמיתי, אין פרסים ואין תשלום.` },
  { n: "2", title: "עונים ברצף במצב זריז", body: "שאלה אחת על המסך: ״כן״ אם אתם חושבים שזה יקרה, ״לא״ אם לא — והבאה עולה מיד." },
  { n: "3", title: "צוברים נקודות אם צדקתם", body: "כל תשובה שצדקה שווה נקודה. אפשר גם לחזור בכם לפני ההכרעה ולנעול את הרווח." },
];

export function HowToPlay() {
  return (
    <section className="card p-3.5 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-bold text-text-strong">איך מתחילים לשחק?</h2>
        <Link href="/about" className="tap -my-2 inline-flex items-center text-xs text-accent-2 hover:underline">
          המדריך המלא
        </Link>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-xl bg-surface-2 p-3">
            <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              {s.n}
            </span>
            <div>
              <div className="text-sm font-bold text-text-strong">{s.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {/* an explainer that ends without the thing it explains is a dead end */}
      <Link
        href="/rapid"
        data-evt="howtoplay-rapid"
        className="tap pressable mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2 sm:w-auto"
      >
        <BoltIcon size={16} />
        להתחיל במצב זריז
      </Link>
    </section>
  );
}
