"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { REFERRAL_BONUS, inviteShareText, inviteUrl } from "@/lib/referral";
import { money } from "@/lib/format";
import { SITE_NAME } from "@/lib/config";

/** No-op subscribe: `navigator.share` never changes for the life of the page. */
const noopSubscribe = () => () => {};

/**
 * The personal invite link, with the three ways anyone actually sends one: WhatsApp,
 * copy, and the phone's own share sheet. The link always points at the configured site
 * URL rather than at `location.origin`, so a link copied from a preview deployment still
 * sends friends to the real site.
 */
export function InviteCard({
  code,
  invited,
  earned,
  remaining,
}: {
  code: string;
  invited: number;
  earned: number;
  remaining: number;
}) {
  const url = inviteUrl(code);
  const [copied, setCopied] = useState(false);
  // the share sheet is a browser-only capability; read through a store so the server
  // and the first client render agree on "no sheet" instead of tearing on hydration
  const canShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // clipboard is blocked without a secure context — leave the link selected instead
      const field = document.getElementById(`invite-link-${code}`) as HTMLInputElement | null;
      field?.select();
    }
  }

  async function share() {
    try {
      await navigator.share({ title: SITE_NAME, text: inviteShareText(url), url });
    } catch {
      // the user dismissed the sheet
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="font-bold text-text-strong">הקישור האישי שלך</h2>
        <p className="text-xs text-muted">
          {invited > 0 ? (
            <>
              הצטרפו דרכך <strong className="text-text-strong">{invited}</strong>{" "}
              {invited === 1 ? "חבר/ה" : "חברים"} · הרווחת{" "}
              <strong className="tabular text-yes">{money(earned)}</strong>
            </>
          ) : (
            <>עדיין לא הצטרף אף אחד דרך הקישור</>
          )}
        </p>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`invite-link-${code}`}
            dir="ltr"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="הקישור האישי שלך"
            className="tap min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={copy}
            className="tap pressable shrink-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
          >
            {copied ? "הועתק ✓" : "העתקת הקישור"}
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(inviteShareText(url))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tap pressable flex flex-1 items-center justify-center gap-2 rounded-xl border border-yes/40 bg-yes/10 px-4 py-2.5 text-sm font-bold text-yes-2 hover:bg-yes/20"
          >
            <WhatsAppIcon />
            שיתוף בוואטסאפ
          </a>
          {canShare && (
            <button
              type="button"
              onClick={share}
              className="tap pressable flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-text hover:border-accent hover:text-accent-2"
            >
              <ShareIcon />
              שיתוף בדרך אחרת
            </button>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted">
          כל חבר/ה שנרשמים דרך הקישור מזכים אתכם ב{money(REFERRAL_BONUS)}, ישירות לניקוד.
          {remaining > 0 ? (
            <> נותרו לכם עוד {remaining} הזמנות מזכות.</>
          ) : (
            <> הגעתם לתקרת ההזמנות המזכות — הקישור ממשיך לעבוד, אבל כבר לא מזכה בבונוס.</>
          )}
        </p>
      </div>
    </section>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.05L2 22l5.1-1.33A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.03.79.81-2.95-.2-.31A8.2 8.2 0 1 1 12 20.2Zm4.5-6.14c-.24-.12-1.45-.72-1.68-.8-.22-.08-.39-.12-.55.12s-.63.8-.78.97c-.14.16-.28.18-.52.06a6.7 6.7 0 0 1-3.35-2.93c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.47-.4-.4-.55-.41h-.47a.9.9 0 0 0-.65.3c-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.62 4.15 3.68 1.55.66 2.15.72 2.92.6.47-.07 1.45-.59 1.65-1.17.2-.57.2-1.06.14-1.17-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
