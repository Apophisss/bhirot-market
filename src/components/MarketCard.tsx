import Link from "next/link";
import type { MarketView } from "@/lib/markets";
import { money, pct, closesLabel, hoursUntil } from "@/lib/format";
import { THIN_MARKET_TRADES } from "@/lib/limits";
import { getCategory } from "@/lib/categories";
import { SITE_TEAM, isTeamAuthored } from "@/lib/config";
import { PeopleStack } from "./PeopleStack";
import type { CSSProperties } from "react";

export function MarketCard({ m, note }: { m: MarketView; note?: string }) {
  const href = `/market/${m.id}`;
  const cat = getCategory(m.category);
  const resolved = m.status !== "open";
  const hours = hoursUntil(m.closesAt);
  const urgent = !resolved && hours > 0 && hours <= 48;
  const soon = !resolved && hours > 48 && hours <= 24 * 7;
  return (
    <article className="card card-hover flex flex-col gap-3 p-3.5 sm:p-4">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <Link href={href} data-evt="market-card" data-evt-market={m.id} className="shrink-0" aria-label={m.title}>
          <PeopleStack photos={m.photos} fallback={cat.cover} size={44} max={3} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span className="cat-chip rounded-md px-1.5 py-0.5" style={{ "--cat": cat.accent, "--cat-dark": cat.accentDark } as CSSProperties}>
              {cat.label}
            </span>
            {isTeamAuthored(m.createdBy) && <span className="text-muted-2">{SITE_TEAM}</span>}
            {urgent && <span className="rounded-md bg-no/15 px-1.5 py-0.5 font-semibold text-no">{closesLabel(m.closesAt)}</span>}
            {soon && <span className="rounded-md bg-warn/15 px-1.5 py-0.5 font-semibold text-warn">נסגר בקרוב</span>}
          </div>
          {/*
            The half-circle gauge that used to sit here said "1% סיכוי" beside a
            "כן 1%" button one row below it: the same number twice in one card, at
            the cost of ~58px of the width the question itself needs. Percentages
            are the site's price language; the buttons already speak it.
          */}
          <Link
            href={href}
            data-evt="market-card"
            data-evt-market={m.id}
            className="line-clamp-3 py-0.5 text-[15px] font-semibold leading-snug text-text-strong hover:text-accent-2"
          >
            {m.title}
          </Link>
          {note && <p className="mt-1 text-[13px] font-medium text-accent-2">{note}</p>}
        </div>
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
            data-evt="market-card-yes"
            data-evt-market={m.id}
            className="tap pressable flex items-center justify-center rounded-lg bg-yes/15 text-center text-sm font-bold text-yes transition hover:bg-yes hover:text-white active:bg-yes active:text-white"
          >
            כן {pct(m.probability)}
          </Link>
          <Link
            href={`${href}?side=no`}
            data-evt="market-card-no"
            data-evt-market={m.id}
            className="tap pressable flex items-center justify-center rounded-lg bg-no/15 text-center text-sm font-bold text-no transition hover:bg-no hover:text-white active:bg-no active:text-white"
          >
            לא {pct(1 - m.probability)}
          </Link>
        </div>
      )}

      {/*
        The activity line reads the DISPLAY pair (see src/lib/fake-market-stats.ts),
        never the recorded one: a question nobody has answered yet used to advertise
        "0 נק׳ · 0 תשובות" beside "היו הראשונים", which is a scoreboard reading zero
        and an argument against joining. The display count starts above
        THIN_MARKET_TRADES, so the "מחיר ראשוני" caveat only appears where the line
        beside it is genuinely small.
      */}
      <footer className="mt-auto flex items-center justify-between gap-2 text-[13px] text-muted">
        <span className="tabular truncate">
          {money(m.displayVolume, { compact: true })} · {m.displayTradeCount} תשובות
          {!resolved && m.displayTradeCount < THIN_MARKET_TRADES && <span className="text-muted-2"> · מחיר ראשוני</span>}
        </span>
        <span className="shrink-0">{resolved || urgent ? "" : closesLabel(m.closesAt)}</span>
      </footer>
    </article>
  );
}
