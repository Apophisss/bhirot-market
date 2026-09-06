"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { usePathname } from "next/navigation";
import { BoltIcon } from "./BoltIcon";
import { EVENTS } from "@/lib/events";
import { track } from "@/lib/track";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE } from "@/lib/rapid";
import { GUEST_LIMIT } from "@/lib/rapid-guest";
import { gateOffered, markGateOffered, pathWantsGate } from "@/lib/entry-gate";

/**
 * "תיכנסו למצב זריז ותתחילו לשחק" — נאמר בכניסה, ולא מחכה שמישהו יגלול.
 *
 * מרונדר מתוך ההדר, ולכן הוא חל על כל כניסה לאתר ולא רק על דף הבית, ובאותה נשימה
 * יודע אם המבקר מחובר בלי לשאול את השרת פעם נוספת. מי שמשחק כבר, מי שבאמצע הרשמה
 * ומי שנחת על הזמנה — לא מקבלים אותו (`GATE_SKIP_PATHS`).
 *
 * החלון עצמו מרונדר תמיד וסגור: `<dialog>` בלי `open` הוא `display: none`, כך שהוא
 * לא תופס מקום, לא מזיז שום דבר בעמוד, ואין לו שום גרסת שרת שהדפדפן יסתור. מה שקורה
 * אחרי ה-mount הוא הפעולה עצמה — `showModal()`, שמביא איתו את הרקע המוכהה, את לכידת
 * הפוקוס ואת הסגירה ב-Esc — ולא רינדור מחדש.
 *
 * הפתיחה מחכה ל-`load` ואז ל-idle, ולא נעשית ברגע ההידרציה. `<dialog>` פתוח הוא
 * הטקסט הגדול והמרכזי בעמוד, ולכן הדפדפן בוחר בפסקה שלו כ-LCP — הפתיחה המוקדמת
 * הפכה חלון על משהו אחר למדד המהירות של הדף שמתחתיו. אחרי `load` הצביעה כבר
 * נמדדה, וההצעה עולה על עמוד שכבר עומד.
 *
 * פעם אחת בביקור: הסימון נכתב ברגע ההצגה ולא בלחיצה, כדי שגם מי שסגר ב-Esc או
 * בלחיצה על הרקע לא יפגוש אותו שוב בעמוד הבא. ההחלטה נופלת פעם אחת, על הכתובת שבה
 * המבקר נחת — ההדר שורד ניווט פנימי, וכניסה לאתר היא הטעינה, לא כל לחיצה בתוכו.
 */
export function RapidEntryGate({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const decided = useRef(false);
  const titleId = useId();

  useEffect(() => {
    if (decided.current) return;
    decided.current = true;
    const path = pathname || "/";
    if (!pathWantsGate(path) || gateOffered()) return;

    const open = () => {
      const dialog = ref.current;
      // nothing to show once the header is gone: leaving the visit unmarked is
      // the right way to be wrong here, because the offer can still be made on
      // the next page and a marked visit never shows it again
      if (!dialog || dialog.open) return;
      markGateOffered();
      dialog.showModal();
      track(EVENTS.rapidGate, { path, props: { action: "shown", loggedIn: loggedIn ? 1 : 0 } });
    };
    const whenIdle = () => {
      // `requestIdleCallback` is still missing on Safari; the timeout is both the
      // fallback and the cap, so the offer is never lost on a page that stays busy
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(open, { timeout: 2000 });
      else window.setTimeout(open, 300);
    };
    // no cleanup on purpose: both callbacks fire once and both check the dialog
    // before touching anything, and removing them would mean React's development
    // double-mount cancels the only scheduled opening
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
  }, [pathname, loggedIn]);

  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby={titleId}
      className="gate-sheet"
    >
      <div className="flex flex-col gap-4 p-5 text-right sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <BoltIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-extrabold text-text-strong sm:text-xl">
              מצב זריז — מתחילים לשחק
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted sm:text-sm">
              שאלה אחרי שאלה על הפוליטיקה הישראלית: כן או לא, {RAPID_MIN_STAKE}–{RAPID_MAX_STAKE} נקודות לתשובה,
              והשאלה הבאה עולה מיד.{" "}
              {loggedIn
                ? "כל תשובה נספרת בניקוד שלכם ומזיזה אתכם בטבלה."
                : `${GUEST_LIMIT} התשובות הראשונות הן בלי חשבון בכלל, והן נשמרות לכם.`}
            </p>
          </div>
          {/* 44px ולא 36: זה הכפתור שסוגר חלון שאיש לא ביקש, והוא היה יעד המגע
              הקטן ביותר במסך הראשון של כל ביקור */}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="סגירה"
            className="pressable -ml-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text-strong"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/rapid"
            data-evt="entry-gate-rapid"
            onClick={() => ref.current?.close()}
            className="tap pressable inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-base font-extrabold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
          >
            <BoltIcon size={16} />
            {loggedIn ? "יאללה, לשאלה הבאה" : "יאללה, מתחילים"}
          </Link>
          {/* דחייה, לא סירוב: מי שבא לקרוא שאלה מסוימת ממשיך בדיוק לאן שהתכוון */}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            data-evt="entry-gate-dismiss"
            className="tap pressable rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:text-text-strong"
          >
            לא עכשיו, אני רק מסתכל
          </button>
        </div>
      </div>
    </dialog>
  );
}
