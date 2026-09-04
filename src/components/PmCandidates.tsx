import Link from "next/link";
import { listPmCandidates } from "@/lib/candidates";
import { MarketImage } from "./MarketImage";

const FALLBACK = "/covers/general.svg";

function questionsLabel(n: number) {
  return n === 1 ? "שאלה אחת" : `${n} שאלות`;
}

/** Portrait strip of the people running for prime minister, on the home page. */
export function PmCandidates({ counts = {}, active }: { counts?: Record<string, number>; active?: string }) {
  const candidates = listPmCandidates();
  if (!candidates.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-text-strong">🏛️ המועמדים לראשות הממשלה</h2>
        {active && (
          <Link href="/" className="text-sm text-accent-2 hover:underline">
            כל השאלות
          </Link>
        )}
      </div>
      <p className="-mt-1 text-sm text-muted">
        ראשי הרשימות שמתמודדים על ראשות הממשלה ב-27.10. לחצו על מועמד כדי לראות את השאלות שנוגעות אליו.
      </p>
      <div className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-7">
        {candidates.map((c) => {
          const n = counts[c.id] ?? 0;
          const on = active === c.id;
          return (
            <Link
              key={c.id}
              href={on ? "/" : `/?person=${c.id}`}
              title={`${c.name} — ${c.note}`}
              aria-current={on ? "true" : undefined}
              className={`card card-hover group relative w-32 shrink-0 snap-start overflow-hidden sm:w-auto ${
                on ? "border-accent ring-2 ring-accent/60 shadow-lg shadow-accent/20" : ""
              }`}
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-2">
                <MarketImage
                  src={c.image}
                  fallback={FALLBACK}
                  alt={c.name}
                  className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.04]"
                />
                {n > 0 && (
                  <span className="tabular absolute end-1.5 top-1.5 rounded-full bg-ink/75 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                    {questionsLabel(n)}
                  </span>
                )}
              </div>
              <div className={`px-2 py-1.5 ${on ? "bg-accent-soft" : ""}`}>
                <div className="truncate text-[13px] font-bold leading-tight text-text-strong">{c.name}</div>
                <div className="truncate text-[11px] text-muted">{c.list}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
