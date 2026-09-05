"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import { EVENTS } from "@/lib/events";

/**
 * Share one question.
 *
 * Every share on the site used to be a share of the *site*: the invite link on
 * /invite, behind a login. There was no way to send a friend the single question
 * you wanted to argue about — which is the thing people actually forward.
 *
 * `navigator.share()` on a phone opens the native sheet (WhatsApp first, in
 * practice); everywhere else it falls back to copying the link. The question's own
 * OG card is already drawn per market by `market/[slug]/og`, so the preview that
 * lands in the chat carries the question and its current price.
 */
export function ShareButton({
  title,
  path,
  text,
  className = "",
  label = "שיתוף",
}: {
  title: string;
  /** absolute path on the site, e.g. /market/<slug> */
  path: string;
  /** the line that travels with the link — the question and where it stands */
  text?: string;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
    track(EVENTS.share, { props: { path } });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // a dismissed sheet is not an error, and neither is a browser that refuses
        // to open one — either way, copying is still a share
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2200);
  }

  return (
    <button
      type="button"
      onClick={share}
      data-evt="share-market"
      className={`tap pressable inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-muted hover:border-border-2 hover:text-text-strong ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      {state === "copied" ? "הקישור הועתק" : state === "failed" ? "לא הצלחנו להעתיק" : label}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "הקישור הועתק" : ""}
      </span>
    </button>
  );
}
