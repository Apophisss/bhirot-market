"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pct } from "@/lib/format";

/** how long to wait after a keystroke before asking the server */
const DEBOUNCE_MS = 140;
/** results in the sheet; more than this and the answer is the full listing */
const LIMIT = 8;

interface Hit {
  slug: string;
  title: string;
  probability: number;
  tradeCount: number;
  status: string;
}

/**
 * Search on a phone.
 *
 * The header's search field is `hidden ... md:block`, and the only other one is on
 * the listing page itself — so below 768px, on a board of hundreds of open
 * questions, a visitor on a market page, in rapid mode or in their portfolio had
 * no way to look anything up at all. The alternatives were category chips and a
 * "show more" button that pages 36 at a time.
 *
 * This is the phone counterpart: an icon in the header on every route, opening a
 * sheet that covers the screen, focuses itself, answers while you type, and closes
 * on Escape, on the backdrop, or on a downward swipe.
 */
export function MobileSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  /*
    The results are stored together with the query they answer, and read back only
    when the two still match. That is what keeps "typing" and "answered" from
    needing a second piece of state: a keystroke invalidates the old results by
    changing `needle`, with no effect having to clear anything.
  */
  const [res, setRes] = useState<{ q: string; hits: Hit[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** only the newest request may paint: a slow early one must not overwrite a fast late one */
  const seq = useRef(0);
  const touchY = useRef<number | null>(null);

  const needle = q.trim();
  const hits = res && res.q === needle ? res.hits : null;
  const busy = needle.length >= 2 && hits === null;

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setRes(null);
  }, []);

  // Escape closes from anywhere, including from inside the field
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    // the page behind must not scroll under the sheet
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || needle.length < 2) return;
    const mine = ++seq.current;
    const timer = window.setTimeout(async () => {
      let hits: Hit[] = [];
      try {
        const response = await fetch(`/api/markets?status=open&limit=${LIMIT}&q=${encodeURIComponent(needle)}`);
        const data = await response.json();
        if (Array.isArray(data?.markets)) hits = data.markets as Hit[];
      } catch {
        // a failed lookup is an empty answer, not a broken sheet
      }
      if (seq.current !== mine) return; // a newer keystroke already owns the sheet
      setRes({ q: needle, hits });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [needle, open]);

  function go(href: string) {
    close();
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // autoFocus alone loses the race with the sheet's own mount on iOS
          window.setTimeout(() => input.current?.focus(), 30);
        }}
        data-evt="mobile-search-open"
        aria-label="חיפוש שאלה"
        className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-accent md:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-bg md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="חיפוש שאלה"
          onTouchStart={(e) => {
            touchY.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchMove={(e) => {
            // a deliberate downward swipe dismisses the sheet, the way a native one does
            const start = touchY.current;
            const now = e.touches[0]?.clientY;
            if (start != null && now != null && now - start > 90) {
              touchY.current = null;
              close();
            }
          }}
        >
          <div className="px-safe flex h-14 items-center gap-2 border-b border-border px-3">
            <form
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (needle) go(`/?q=${encodeURIComponent(needle)}`);
              }}
            >
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="חיפוש שאלה: נתניהו, סקר, בנט…"
                className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-10 pl-3 text-base outline-none placeholder:text-muted-2 focus:border-accent focus:bg-surface"
              />
            </form>
            <button type="button" onClick={close} className="tap shrink-0 px-2 text-sm font-semibold text-muted hover:text-text-strong">
              ביטול
            </button>
          </div>

          {/*
            The list is its own scroll container and stops above the keyboard rather
            than under it: `100dvh` follows the visible viewport when the keyboard
            opens, so the first result stays on screen while typing.
          */}
          <div className="h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain px-3 pb-24">
            {needle.length < 2 ? (
              <p className="px-1 py-5 text-sm text-muted">הקלידו שם, מפלגה או נושא — התוצאות יופיעו תוך כדי.</p>
            ) : hits === null ? (
              <p className="px-1 py-5 text-sm text-muted-2">{busy ? "מחפש…" : ""}</p>
            ) : hits.length === 0 ? (
              <p className="px-1 py-5 text-sm text-muted">לא נמצאו שאלות פתוחות ל״{needle}״.</p>
            ) : (
              <ul className="divide-y divide-border">
                {hits.map((h) => (
                  <li key={h.slug}>
                    <button
                      type="button"
                      onClick={() => go(`/market/${h.slug}`)}
                      className="tap flex w-full items-center gap-3 py-3 text-right"
                    >
                      <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug text-text-strong">{h.title}</span>
                      <span
                        className={`tabular shrink-0 rounded-md px-2 py-1 text-xs font-bold ${
                          h.probability >= 0.5 ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
                        }`}
                      >
                        {pct(h.probability)}
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => go(`/?q=${encodeURIComponent(needle)}`)}
                    className="tap w-full py-3 text-right text-sm font-semibold text-accent-2"
                  >
                    כל התוצאות ל״{needle}״
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
