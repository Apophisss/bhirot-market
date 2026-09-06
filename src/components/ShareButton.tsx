"use client";

import { useState, useSyncExternalStore } from "react";
import { track } from "@/lib/track";
import { EVENTS } from "@/lib/events";
import { shareMessage, shareUrl, whatsappHref, type ShareSource } from "@/lib/share";

/** No-op subscribe: `navigator.share` never changes for the life of the page. */
const noopSubscribe = () => () => {};

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
 *
 * The link that goes out carries `?ref=share&s=<surface>` (see `lib/share.ts`), so
 * the visit it brings back is attributable. Without it the most natural referral in
 * the product — one person arguing with another about a question — arrived as direct
 * traffic and could not be told apart from someone typing the address in.
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

  // the server has no navigator, so the sheet is assumed absent until the browser says
  // otherwise: server and first client render agree on "no sheet" instead of tearing
  const canShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  function done(source: ShareSource) {
    track(EVENTS.share, { props: { path, s: source } });
  }

  async function share() {
    if (canShare) {
      const url = shareUrl(path, "native");
      try {
        await navigator.share({ title, text: shareMessage(text, url), url });
        done("native");
        return;
      } catch {
        // a dismissed sheet is not an error, and neither is a browser that refuses
        // to open one — either way, copying is still a share
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl(path, "copy"));
      done("copy");
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2200);
  }

  // one shape for both controls; the caller's className stays on the button alone, the
  // way it always did — on the WhatsApp link it would fight the green with a background
  const chip = "tap pressable inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold";

  return (
    <>
      <button
        type="button"
        onClick={share}
        data-evt="share-market"
        className={`${chip} border-border bg-surface text-muted hover:border-border-2 hover:text-text-strong ${className}`}
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
      {/*
        Beside the sheet rather than inside it. WhatsApp is where this link is going in
        practice, and on a desktop — where there is no sheet at all — the button above
        can only copy: without this there was no way to actually send the question from
        a laptop. `wa.me` is also the only path on which we compose the message
        ourselves, which is why `shareMessage()` puts the URL on its own line.
      */}
      <a
        href={whatsappHref(shareMessage(text, shareUrl(path, "wa")))}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => done("wa")}
        data-evt="share-market-wa"
        aria-label={`${label} בוואטסאפ — ${title}`}
        className={`${chip} border-yes/40 bg-yes/10 text-yes-2 hover:bg-yes/20`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15.05L2 22l5.1-1.33A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.03.79.81-2.95-.2-.31A8.2 8.2 0 1 1 12 20.2Zm4.5-6.14c-.24-.12-1.45-.72-1.68-.8-.22-.08-.39-.12-.55.12s-.63.8-.78.97c-.14.16-.28.18-.52.06a6.7 6.7 0 0 1-3.35-2.93c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.47-.4-.4-.55-.41h-.47a.9.9 0 0 0-.65.3c-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.62 4.15 3.68 1.55.66 2.15.72 2.92.6.47-.07 1.45-.59 1.65-1.17.2-.57.2-1.06.14-1.17-.06-.1-.22-.16-.46-.28Z" />
        </svg>
        וואטסאפ
      </a>
    </>
  );
}
