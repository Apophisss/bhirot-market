"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  GUEST_LIMIT,
  guestAnswersLeft,
  readGuestAnswers,
  serverGuestAnswers,
  subscribeGuestAnswers,
} from "@/lib/rapid-guest";

/**
 * The strip above the deck for a visitor with no account: how much of the free run
 * is left, and what the account it eventually asks for actually is.
 *
 * It used to be a static line on the server ("4 תשובות ראשונות בלי חשבון"), which
 * was true only for the first card: after that it kept quoting the opening number
 * to someone who had already spent most of it, and the wall arrived without ever
 * having been counted down. With a ten-answer run that gap is most of the visit, so
 * the strip reads the same browser store the deck writes to and counts down with it.
 *
 * The server snapshot is "answered nothing" (`serverGuestAnswers`), which is what a
 * first-time visitor is — so the markup the server sends is the one they should see,
 * and a returning guest's own count arrives on hydration.
 *
 * The second half of every variant is the part that is not about the limit: free,
 * one click, and it opens the rest of the game. A limit stated on its own reads as a
 * meter running out; stated next to what lifting it costs (nothing) it reads as an
 * offer.
 *
 * One row, and the row is the link. As a paragraph with a link inside it this was two
 * lines of text plus the link's own 44px tap height — 78px measured on a 375px phone,
 * out of the ~280px the deck had for the card underneath. Now the 44px it costs *is*
 * the tap target, the sentence truncates instead of wrapping, and its tail (what the
 * account opens) comes back from `lg`, where there is a line to say it on.
 *
 * Under 500px of viewport it steps aside altogether (`tiny:`): there the card has
 * about 190px, every card in the deck already ends with "התשובות נשמרות · ההתחברות
 * מכניסה אותן לניקוד", the header carries a התחברות button on every page, and the end
 * of the free run puts this same offer up full-screen with the answers behind it.
 */
export function GuestRunBanner() {
  const answers = useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
  const left = guestAnswersLeft(answers);

  return (
    <Link
      href="/login?callbackUrl=%2Frapid"
      data-evt="rapid-guest-note"
      className="tap flex shrink-0 items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 text-[13px] leading-snug text-text hover:bg-accent/15 tiny:hidden sm:text-sm"
    >
      <span className="min-w-0 flex-1 truncate">
        {answers.length === 0 ? (
          <>{GUEST_LIMIT} תשובות ראשונות בלי חשבון — הן נשמרות</>
        ) : left > 0 ? (
          <>
            נשארו לכם <strong className="tabular">{left}</strong> {left === 1 ? "תשובה" : "תשובות"} בלי חשבון — הכול נשמר
          </>
        ) : (
          <>הכול נשמר לכם</>
        )}
        <span className="hidden lg:inline">, וההרשמה מכניסה אותן לניקוד ופותחת את הלוח כולו, טבלת מובילים וליגות עם חברים</span>
      </span>
      {/* "בלחיצה אחת" is worth a third of a 375px row, and on that row it is competing
          with the count that says why the offer is here at all */}
      <span className="shrink-0 font-bold text-accent-2">
        הרשמה חינם<span className="hidden sm:inline"> בלחיצה אחת</span> ←
      </span>
    </Link>
  );
}
