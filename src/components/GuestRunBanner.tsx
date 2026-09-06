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
 */
export function GuestRunBanner() {
  const answers = useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
  const left = guestAnswersLeft(answers);

  return (
    <p className="shrink-0 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-[13px] leading-snug text-text short:py-1 short:text-xs sm:py-2 sm:text-sm">
      {answers.length === 0 ? (
        <>{GUEST_LIMIT} תשובות ראשונות בלי חשבון — הן נשמרות, ו</>
      ) : left > 0 ? (
        <>
          נשארו לכם <strong className="tabular">{left}</strong> {left === 1 ? "תשובה" : "תשובות"} בלי חשבון —
          הכול נשמר, ו
        </>
      ) : (
        <>הכול נשמר לכם, ו</>
      )}
      <Link href="/login?callbackUrl=%2Frapid" className="inline-flex min-h-11 items-center font-bold text-accent-2 hover:underline">
        הרשמה חינם בלחיצה אחת
      </Link>{" "}
      מכניסה אותן לניקוד ופותחת את הלוח כולו, טבלת מובילים וליגות עם חברים.
    </p>
  );
}
