import Link from "next/link";
import type { MarketView } from "@/lib/markets";
import { money, pct, closesLabel, hoursUntil } from "@/lib/format";
import { ProbabilityGauge } from "./ProbabilityGauge";
import { getCategory } from "@/lib/categories";
import { SITE_TEAM, isTeamAuthored } from "@/lib/config";
import { PeopleStack } from "./PeopleStack";

export function MarketCard({ m }: { m: MarketView }) {
  const href = `/market/${m.id}`;
  const cat = getCategory(m.category);
  const resolved = m.status !== "open";
  const hours = hoursUntil(m.closesAt);
  const urgent = !resolved && hours > 0 && hours <= 48;
  const soon = !resolved && hours > 48 && hours <= 24 * 7;
  return (
    <article className="card card-hover flex flex-col gap-3 p-3.5 sm:p-4">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <Link href={href} className="shrink-0" aria-label={m.title}>
          <PeopleStack photos={m.photos} fallback={cat.cover} size={44} max={3} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <span className="rounded-md px-1.5 py-0.5" style={{ background: `${cat.accent}22`, color: cat.accent }}>
              {cat.label}
            </span>
            {isTeamAuthored(m.createdBy) && <span className="text-muted-2">{SITE_TEAM}</span>}
            {urgent && <span className="rounded-md bg-no/15 px-1.5 py-0.5 font-semibold text-no">{closesLabel(m.closesAt)}</span>}
            {soon && <span className="rounded-md bg-warn/15 px-1.5 py-0.5 font-semibold text-warn">נסגר בקרוב</span>}
          </div>
          <Link href={href} className="line-clamp-3 text-[15px] font-semibold leading-snug text-text-strong hover:text-accent-2">
            {m.title}
          </Link>
        </div>
        <ProbabilityGauge p={m.probability} size={58} />
      </div>

      {resolved ? (
        <div
          className={`rounded-lg px-3 py-2.5 text-center text-sm font-bold ${
            m.status === "cancelled" ? "bg-surface-2 text-muted" : m.resolution === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
          }`}
        >
          {m.status === "cancelled" ? "בוטל" : m.resolution === "YES" ? "הוכרע: כן" : "הוכרע: לא"}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`${href}?side=yes`}
            className="tap pressable flex items-center justify-center rounded-lg bg-yes/15 text-center text-sm font-bold text-yes transition hover:bg-yes hover:text-white active:bg-yes active:text-white"
          >
            כן {pct(m.probability)}
          </Link>
          <Link
            href={`${href}?side=no`}
            className="tap pressable flex items-center justify-center rounded-lg bg-no/15 text-center text-sm font-bold text-no transition hover:bg-no hover:text-white active:bg-no active:text-white"
          >
            לא {pct(1 - m.probability)}
          </Link>
        </div>
      )}

      <footer className="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted sm:text-xs">
        <span className="tabular truncate">{money(m.volume, { compact: true })} נפח · {m.tradeCount} עסקאות</span>
        <span className="shrink-0">{resolved || urgent ? "" : closesLabel(m.closesAt)}</span>
      </footer>
    </article>
  );
}
