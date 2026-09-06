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
  /*
    The caveat is decided on `tradeCount` — the recorded one — and this is the fix it
    needed. It used to compare `displayTradeCount`, which starts at a fabricated floor
    of 4 (src/lib/fake-market-stats.ts) against a threshold of 3, so the line added
    after a single 7,110-point answer moved a market from 50% to 1% could not appear on
    any open question on the board. Reading the real count brings it back on all ~284
    questions nobody has answered yet.
  */
  const thin = !resolved && m.tradeCount < THIN_MARKET_TRADES;
  const answers =
    m.tradeCount === 0
      ? "עדיין אין תשובות של שחקנים"
      : m.tradeCount === 1
        ? "יש תשובה אחת של שחקנים"
        : `יש ${m.tradeCount} תשובות של שחקנים`;
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
        // `?side=yes` and `?side=no` are the same page with the answer panel pre-set,
        // so every question on the board offers a crawler two more URLs with the same
        // content as the canonical one. `rel="nofollow"` keeps the duplicates out of
        // the crawl; a reader who clicks still gets the panel they asked for.
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`${href}?side=yes`}
            rel="nofollow"
            data-evt="market-card-yes"
            data-evt-market={m.id}
            className="tap pressable flex items-center justify-center rounded-lg bg-yes/15 text-center text-sm font-bold text-yes transition hover:bg-yes hover:text-white active:bg-yes active:text-white"
          >
            כן {pct(m.probability)}
          </Link>
          <Link
            href={`${href}?side=no`}
            rel="nofollow"
            data-evt="market-card-no"
            data-evt-market={m.id}
            className="tap pressable flex items-center justify-center rounded-lg bg-no/15 text-center text-sm font-bold text-no transition hover:bg-no hover:text-white active:bg-no active:text-white"
          >
            לא {pct(1 - m.probability)}
          </Link>
        </div>
      )}

      {/*
        Two different footers, because the two claims cannot share a line.

        A question that has been answered shows the DISPLAY pair (see
        src/lib/fake-market-stats.ts), which is what the rest of the site advertises:
        a card reading "0 נק׳ · 0 תשובות" beside "היו הראשונים" is a scoreboard
        reading zero, and a scoreboard reading zero is an argument against joining.

        A question that has NOT been answered says so instead. Printing the caveat
        next to the fabricated pair would have put "4 תשובות · עדיין אין תשובות של
        שחקנים" in one seven-word line — the contradiction is worse than either half,
        and the point of the caveat is that the number beside it is not a crowd's
        answer but the opening estimate the editorial team priced.
      */}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px] text-muted">
        {thin ? (
          <span className="min-w-0">
            ההערכה של המערכת: <span className="tabular font-semibold text-text">{pct(m.probability)}</span> · {answers}
          </span>
        ) : (
          <span className="tabular truncate">
            {money(m.displayVolume, { compact: true })} · {m.displayTradeCount} תשובות
          </span>
        )}
        <span className="shrink-0">{resolved || urgent ? "" : closesLabel(m.closesAt)}</span>
      </footer>
    </article>
  );
}
