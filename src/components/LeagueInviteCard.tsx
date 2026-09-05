"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { leagueShareText, leagueUrl } from "@/lib/social";
import { SITE_NAME } from "@/lib/config";

/** No-op subscribe: `navigator.share` never changes for the life of the page. */
const noopSubscribe = () => () => {};

/**
 * The league's invite link, with the three ways anyone actually sends one: WhatsApp,
 * copy, and the phone's own share sheet — the same card the personal invite link gets
 * (`InviteCard`), because it is the same job.
 *
 * The link always points at the configured site URL rather than at `location.origin`,
 * so a link copied from a preview deployment still sends friends to the real site.
 */
export function LeagueInviteCard({ code, name }: { code: string; name: string }) {
  const url = leagueUrl(code);
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
      const field = document.getElementById(`league-link-${code}`) as HTMLInputElement | null;
      field?.select();
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `${name} · ${SITE_NAME}`, text: leagueShareText(name, url), url });
    } catch {
      // the user dismissed the sheet
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`league-link-${code}`}
          dir="ltr"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="קישור ההזמנה לליגה"
          className="tap min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={copy}
          data-evt="league-copy-link"
          className="tap pressable shrink-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
        >
          {copied ? "הועתק ✓" : "העתקת הקישור"}
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(leagueShareText(name, url))}`}
          target="_blank"
          rel="noopener noreferrer"
          data-evt="league-share"
          className="tap pressable flex flex-1 items-center justify-center gap-2 rounded-xl border border-yes/40 bg-yes/10 px-4 py-2.5 text-sm font-bold text-yes-2 hover:bg-yes/20"
        >
          שיתוף בוואטסאפ
        </a>
        {canShare && (
          <button
            type="button"
            onClick={share}
            data-evt="league-share"
            className="tap pressable flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-text hover:border-accent hover:text-accent-2"
          >
            שיתוף בדרך אחרת
          </button>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        כל מי שפותח/ת את הקישור ומתחבר/ת מצטרף/ת לליגה ורואה את הטבלה — שמות, ניקוד ומקום. שלחו אותו רק לאנשים שאתם
        רוצים בפנים.
      </p>
    </div>
  );
}
