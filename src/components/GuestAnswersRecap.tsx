"use client";

import { useSyncExternalStore } from "react";
import { pct } from "@/lib/format";
import { readGuestAnswers, serverGuestAnswers, subscribeGuestAnswers } from "@/lib/rapid-guest";

/**
 * The answers a visitor already gave, shown back to them on the sign-in screen.
 *
 * The screen used to say "מקבלים 10,000 נק׳ ומתחילים לנחש" to someone who had
 * just answered four questions — an offer to start, made to a player already
 * mid-run, with no mention anywhere that the four answers existed or were about
 * to be claimed. The banner on the deck promises the answers are kept and that
 * signing in puts them into the score; this is the screen that has to make good
 * on the promise, and it can only do that by naming them.
 *
 * Rendered from the browser store, so it is empty for anyone arriving at the
 * sign-in screen without a run behind them and the page reads exactly as it did.
 */
export function GuestAnswersRecap() {
  const answers = useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
  if (!answers.length) return null;

  return (
    <section className="mt-5 rounded-xl border border-accent/40 bg-accent/10 p-3.5">
      <h2 className="text-[15px] font-black text-text-strong">
        ענית על {answers.length} {answers.length === 1 ? "שאלה" : "שאלות"}
      </h2>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">
        {answers.length === 1 ? "היא נשמרה בדפדפן ותיכנס" : "הן נשמרו בדפדפן וייכנסו"} לניקוד שלכם ברגע שתתחברו.
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {answers.map((a) => (
          <li key={a.marketSlug} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2">
            <span className={`shrink-0 text-[15px] font-black ${a.side === "YES" ? "text-yes" : "text-no"}`}>
              {a.side === "YES" ? "כן" : "לא"}
            </span>
            <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-text">{a.title}</span>
            <span className="tabular shrink-0 text-[13px] text-muted-2">{pct(a.priceAtAnswer)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
