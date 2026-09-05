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
import { gaEvent } from "@/lib/gtag";

/**
 * Turns the answers a visitor gave before signing in into real positions.
 *
 * Rendered by the header, so it runs on whatever page the sign-in happens to land
 * on — the flow goes through `/onboarding` before it gets anywhere near `/rapid`,
 * and the answers must not be waiting on the visitor to walk back to the deck.
 *
 * The answers are claimed (cleared) *before* the first request goes out. That is
 * the ordering that matters: a second tab, a refresh mid-flight or React's
 * development double-mount then finds nothing to send, and the worst case is an
 * answer that is lost rather than a position that is opened twice.
 *
 * The stored price is not sent. `/api/rapid/answer` quotes the market as it is
 * now, so a question whose price moved while the visitor was at Google is bought
 * at the real one, and a question that closed in the meantime simply fails and is
 * counted as skipped.
 */
export function RapidGuestSync({ loggedIn, stake }: { loggedIn: boolean; stake: number }) {
  const router = useRouter();
  const pending = useSyncExternalStore(subscribeGuestAnswers, readGuestAnswers, serverGuestAnswers);
  const [result, setResult] = useState<{ ok: number; skipped: number } | null>(null);
  /** one redemption per page load, whatever re-renders happen around it */
  const started = useRef(false);

  const dismiss = useCallback(() => setResult(null), []);

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
            body: JSON.stringify({ marketId: a.marketSlug, side: a.side, stake }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.ok) ok += 1;
        } catch {
          // a network failure costs this one answer, not the rest of them
        }
      }
      if (ok) gaEvent("rapid_guest_redeem", { count: ok });
      setResult({ ok, skipped: answers.length - ok });
      if (ok) router.refresh();
    })();
  }, [loggedIn, pending, router, stake]);

  if (!result || result.ok === 0) return null;

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 lg:pb-4" role="status" aria-live="polite">
      <div className="card slide-up flex max-w-md items-center gap-3 p-3 shadow-lg shadow-ink/20">
        <div className="min-w-0 flex-1 text-[13px]">
          <strong className="text-text-strong">{result.ok} מהתשובות שלך הפכו לפוזיציות.</strong>
          {result.skipped > 0 && <span className="text-muted-2"> {result.skipped} כבר לא היו זמינות.</span>}
        </div>
        <Link
          href="/portfolio"
          onClick={dismiss}
          className="tap pressable inline-flex shrink-0 items-center rounded-lg bg-accent px-3 text-xs font-bold text-white hover:bg-accent-2"
        >
          לתיק
        </Link>
        <button onClick={dismiss} aria-label="סגירה" className="tap shrink-0 px-1 text-muted-2 hover:text-text-strong">
          ✕
        </button>
      </div>
    </div>
  );
}
