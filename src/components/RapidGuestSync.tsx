"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  clearGuestAnswers,
  readGuestAnswers,
  serverGuestAnswers,
  subscribeGuestAnswers,
} from "@/lib/rapid-guest";
import { RAPID_DEFAULT_STAKE, clampStake } from "@/lib/rapid";
import { claimGuestSettings } from "@/lib/settings-client";
import { track } from "@/lib/track";
import { EVENTS } from "@/lib/events";

/**
 * Turns what a visitor did before signing in into part of the account.
 *
 * Rendered by the header, so it runs on whatever page the sign-in happens to land
 * on — the flow goes through `/onboarding` before it gets anywhere near `/rapid`,
 * and the answers must not be waiting on the visitor to walk back to the deck.
 *
 * Two things are claimed, and they are claimed differently. The **answers** are
 * facts about money and are claimed exactly once: cleared from the browser
 * *before* the first request goes out, so a second tab, a refresh mid-flight or
 * React's development double-mount finds nothing to send — the worst case is an
 * answer that is lost rather than a position that is opened twice. The **chosen
 * stake** is a preference, so it is merely offered to the account: the server
 * keeps it only where the account never chose one (`claimSettings`), which is
 * what stops a browser that was last used as a guest from overwriting a choice
 * this account made on another device.
 *
 * The stored price is not sent. `/api/rapid/answer` quotes the market as it is
 * now, so a question whose price moved while the visitor was at Google is bought
 * at the real one, and a question that closed in the meantime simply fails and is
 * counted as skipped. The stored *stake* is sent: it is what the card said while
 * it was being answered, and the server clamps it to the binding range anyway.
 */
export function RapidGuestSync({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const pending = useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
  const [result, setResult] = useState<{ ok: number; skipped: number } | null>(null);
  /** one redemption per page load, whatever re-renders happen around it */
  const started = useRef(false);
  /** the preference is offered once per page load too, answers or no answers */
  const claimedSettings = useRef(false);

  const dismiss = useCallback(() => setResult(null), []);

  // A visitor who moved the slider and then signed in without finishing a run still
  // made a choice; it is claimed on its own, not as a side effect of an answer.
  useEffect(() => {
    if (!loggedIn || claimedSettings.current) return;
    claimedSettings.current = true;
    void claimGuestSettings();
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || started.current || pending.length === 0) return;
    started.current = true;
    const answers = pending;
    clearGuestAnswers();

    void (async () => {
      let ok = 0;
      for (const a of answers) {
        try {
          // strictly one at a time: every answer debits the same balance row, and
          // the server's read-modify-write is not safe against parallel callers
          const res = await fetch("/api/rapid/answer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              marketId: a.marketSlug,
              side: a.side,
              stake: clampStake(a.stake ?? RAPID_DEFAULT_STAKE),
            }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.ok) ok += 1;
        } catch {
          // a network failure costs this one answer, not the rest of them
        }
      }
      // first-party as well as GA4: this is the moment a free run became an account's
      // positions, and the paid funnel's last step before "first trade"
      track(EVENTS.guestRedeem, { props: { ok, skipped: answers.length - ok } });
      setResult({ ok, skipped: answers.length - ok });
      if (ok) router.refresh();
    })();
  }, [loggedIn, pending, router]);

  if (!result || result.ok === 0) return null;

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 lg:pb-4" role="status" aria-live="polite">
      <div className="card slide-up flex max-w-md items-center gap-3 p-3 shadow-lg shadow-ink/20">
        <div className="min-w-0 flex-1 text-[13px]">
          <strong className="text-text-strong">{result.ok} מהתשובות שלך נכנסו לניקוד.</strong>
          {result.skipped > 0 && <span className="text-muted-2"> {result.skipped} כבר לא היו זמינות.</span>}
        </div>
        <Link
          href="/portfolio"
          onClick={dismiss}
          className="tap pressable inline-flex shrink-0 items-center rounded-lg bg-accent px-3 text-xs font-bold text-white hover:bg-accent-2"
        >
          לניקוד
        </Link>
        <button onClick={dismiss} aria-label="סגירה" className="tap shrink-0 px-1 text-muted-2 hover:text-text-strong">
          ✕
        </button>
      </div>
    </div>
  );
}
