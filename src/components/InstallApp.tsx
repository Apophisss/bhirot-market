"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { EVENTS } from "@/lib/events";
import { track } from "@/lib/track";
import { SITE_NAME } from "@/lib/config";
import {
  clearInstallPrompt,
  detectPlatform,
  getInstallPrompt,
  INSTALLABLE_EVENT,
  isInstalled,
  isSnoozed,
  markInstalled,
  snooze,
  type InstallPlatform,
} from "@/lib/install";

/**
 * "הוסיפו את בחירות מרקט למסך הבית" — מוצע בשתי דרכים.
 *
 * `InstallPrompt` היא ההמלצה: כרטיס שאפשר לדחות, בדף הבית ובעמוד הניקוד, שמוצג רק
 * בטלפון, רק מחוץ לאפליקציה המותקנת, ורק אם לא נדחה לאחרונה.
 *
 * `InstallLink` היא האפשרות הקבועה: שורה בפוטר שפותחת את אותו חלון לפי דרישה, בכל
 * עמוד ובכל פלטפורמה, בין אם ההמלצה הוצגה אי פעם ובין אם נדחתה לפני חודשיים.
 *
 * שניהם מכריעים הכול אחרי ה-mount — פלטפורמה, תמיכה בהתקנה ומצב הדחייה חיים כולם
 * בדפדפן — ולכן השרת לא מרנדר כאן כלום ואין שום אי-התאמת hydration להשתיק.
 */

/** האירוע שנשלח לאנליטיקה בכל שלב במסלול ההתקנה. */
type InstallAction = "shown" | "prompted" | "accepted" | "dismissed" | "instructions" | "installed";

function trackInstall(action: InstallAction, platform: InstallPlatform) {
  track(EVENTS.installApp, { props: { action, platform } });
}

type InstallState = {
  platform: InstallPlatform;
  /** כרומיום חנה אצלנו אירוע התקנה אמיתי שאפשר לשחזר בלחיצה. */
  canPrompt: boolean;
  /** כבר רץ ממסך הבית — אין מה להציע. */
  installed: boolean;
  /** "לא עכשיו" שנלחץ לאחרונה. משתיק את הכרטיס בלבד, לא את שורת הפוטר. */
  snoozed: boolean;
};

function useInstall() {
  const [state, setState] = useState<InstallState | null>(null);

  useEffect(() => {
    const platform = detectPlatform();

    // כל עובדות הדפדפן נקראות יחד, בקריאה אחת אחרי ה-mount: לפני זה אין navigator,
    // אין localStorage ואין אירוע חנוי, ולשרת אין מה לומר על אף אחד מהם
    const sync = () =>
      setState({
        platform,
        canPrompt: Boolean(getInstallPrompt()),
        installed: isInstalled(),
        snoozed: isSnoozed(),
      });

    sync();

    function onInstalled() {
      // כל קומפוננטה שמוצגת שומעת `appinstalled`, ולכן הראשונה שמגיבה היא זו שמדווחת —
      // הבדיקה נעשית לפני הסימון, לא אחריו
      if (!isInstalled()) trackInstall("installed", platform);
      markInstalled();
    }

    window.addEventListener(INSTALLABLE_EVENT, sync);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(INSTALLABLE_EVENT, sync);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /**
   * פותח את דיאלוג ההתקנה של מערכת ההפעלה. מחזיר false כשאין מה לפתוח — וזה הסימן
   * לקורא להראות במקום זה את הצעדים הידניים.
   */
  const promptInstall = useCallback(async () => {
    const event = getInstallPrompt();
    if (!event) return false;

    const platform = detectPlatform();
    trackInstall("prompted", platform);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      trackInstall(outcome === "accepted" ? "accepted" : "dismissed", platform);
      // `appinstalled` מגיע אחר כך, אבל לא תמיד מייד — ועד שהוא מגיע, כרטיס שעדיין
      // כתוב בו "הוספה למסך הבית" פשוט משקר. הסימון כאן גונז את שורת הפוטר באותו
      // רגע שבו נגנז הכרטיס
      if (outcome === "accepted") markInstalled();
    } catch {
      // האירוע כבר נוצל (קריאה שנייה ל-prompt() על אותו אירוע תמיד זורקת)
      clearInstallPrompt();
      return false;
    }
    clearInstallPrompt();
    return true;
  }, []);

  return { state, promptInstall };
}

/** ההמלצה. לא מרנדרת כלום אלא אם יש לה מה להמליץ. */
export function InstallPrompt() {
  const { state, promptInstall } = useInstall();
  const [dismissed, setDismissed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const announced = useRef(false);

  // הכרטיס הוא לטלפונים: בדסקטופ הניסוח ("מסך הבית") פשוט לא נכון והתמורה קטנה,
  // ולכן שם זו שורה בפוטר בלבד
  const mobile = state?.platform === "ios" || state?.platform === "android";
  const visible = Boolean(state) && mobile && !state?.installed && !state?.snoozed && !dismissed;

  useEffect(() => {
    if (!visible || announced.current || !state) return;
    announced.current = true;
    trackInstall("shown", state.platform);
  }, [visible, state]);

  if (!state || !visible) return null;

  const platform = state.platform;

  function dismiss() {
    setDismissed(true);
    snooze();
    trackInstall("dismissed", platform);
  }

  async function add() {
    // אנדרואיד: הדיאלוג האמיתי של מערכת ההפעלה. iOS — וכל כרומיום שלא חנה אצלנו
    // אירוע — נופלים לצעדים הידניים
    if (await promptInstall()) return;
    setSheetOpen(true);
    trackInstall("instructions", platform);
  }

  // בכוונה כרטיס שקט, ולא עוד כרטיס בצבע ההדגשה: ההזמנה שמעליו בלוח היא ההצעה שמותר
  // לה לצעוק, והתקנת האפליקציה לעולם לא חשובה יותר מהשאלה הבאה שיש לענות עליה
  return (
    <section
      aria-label="הוספה למסך הבית"
      className="card flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
    >
      <span aria-hidden className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent sm:flex">
        <PhonePlusIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-text-strong sm:text-base">
          <span aria-hidden className="text-accent sm:hidden">
            <PhonePlusIcon size={16} />
          </span>
          הוסיפו את {SITE_NAME} למסך הבית
        </h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted sm:text-sm">
          נפתח כמו אפליקציה — מסך מלא בלי סרגלי הדפדפן, קיצור ישיר למצב הזריז ולניקוד שלכם, והתשובות
          והנקודות נשארות בדיוק כפי שהן.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={add}
          data-evt="install-prompt-add"
          className="tap pressable inline-flex items-center justify-center rounded-xl border border-border-2 px-4 py-2.5 text-sm font-bold text-text-strong hover:border-accent hover:text-accent"
        >
          {state.canPrompt ? "הוספה למסך הבית" : "איך מוסיפים?"}
        </button>
        {/* אותה "לא עכשיו" של שאר ההצעות בלוח, ובאותו מקום — דחייה ולא סירוב: היא
            דוחה לחודש, ולא מוחקת את האפשרות מהפוטר */}
        <button
          type="button"
          onClick={dismiss}
          data-evt="install-prompt-later"
          className="tap pressable rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:text-text-strong"
        >
          לא עכשיו
        </button>
      </div>

      <InstallSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        platform={platform}
        canPrompt={state.canPrompt}
        onInstall={promptInstall}
      />
    </section>
  );
}

/** האפשרות הקבועה, לפוטר — תמיד נגישה, אף פעם לא נודניקית. */
export function InstallLink() {
  const { state, promptInstall } = useInstall();
  const [open, setOpen] = useState(false);

  // נעלמת רק כשהאתר באמת מותקן: המלצה שנדחתה לא לוקחת איתה את האפשרות
  if (!state || state.installed) return null;

  const platform = state.platform;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackInstall("instructions", platform);
        }}
        data-evt="footer-install"
        className="tap inline-flex min-w-11 items-center justify-center gap-1.5 hover:text-white"
      >
        <PhonePlusIcon size={13} />
        הוספה למסך הבית
      </button>
      <InstallSheet
        open={open}
        onClose={() => setOpen(false)}
        platform={platform}
        canPrompt={state.canPrompt}
        onInstall={promptInstall}
      />
    </>
  );
}

/** צעד אחד. האייקון, איפה שיש, הוא הכפתור שצריך לחפש על המסך. */
type Step = { text: string; icon?: (props: { size?: number }) => React.ReactElement };

/**
 * הצעדים, לכל פלטפורמה. ל-iOS אין בכלל API של התקנה, ולכן שם זה כל הפיצ'ר; באנדרואיד
 * זו נפילה לאחור לדפדפנים שלא יורים `beforeinstallprompt` (פיירפוקס, Samsung Internet)
 * או שכבר ניצלו אותו.
 *
 * iOS 26 הזיז את השערים: הפריסה ה"קומפקטית" שהיא ברירת המחדל בספארי כבר לא מציגה כפתור
 * שיתוף על המסך — הסרגל התכווץ לתפריט "⋯" אופקי בקצה שורת הכתובת, ו"הוספה למסך הבית"
 * יושבת רמה אחת עמוק יותר, בתוך תפריט השיתוף שבו. פתיחה ב"לחצו על כפתור השיתוף" שלחה
 * אנשים לחפש כפתור שכבר לא נמצא שם, ולכן תפריט הנקודות מוביל וכפתור השיתוף שומר על
 * מקומו בהערה — בשביל הפריסות הישנות, ובשביל כרום באייפון.
 */
function steps(platform: InstallPlatform): { title: string; list: Step[]; note: string | null } {
  if (platform === "ios") {
    return {
      title: "הוספה למסך הבית באייפון ובאייפד",
      list: [
        { text: "פתחו את תפריט שלוש הנקודות שבקצה שורת הכתובת, בדרך כלל בתחתית המסך.", icon: DotsRowIcon },
        { text: 'בחרו "שיתוף", וגללו בתפריט עד "הוספה למסך הבית".', icon: ShareIcon },
        { text: 'אשרו בלחיצה על "הוספה", והאייקון יופיע במסך הבית.' },
      ],
      note: "אין תפריט נקודות? בגרסאות ובפריסות אחרות של ספארי מתחילים ישר מכפתור השיתוף — ריבוע עם חץ כלפי מעלה. באייפון ההוספה תמיד ידנית, אין קיצור אוטומטי.",
    };
  }

  if (platform === "android") {
    return {
      title: "הוספה למסך הבית באנדרואיד",
      list: [
        { text: "פתחו את תפריט הדפדפן — שלוש הנקודות בפינה.", icon: DotsIcon },
        { text: 'בחרו "התקנת אפליקציה" או "הוספה למסך הבית".' },
        { text: "אשרו, והאייקון יתווסף למסך הבית." },
      ],
      note: null,
    };
  }

  return {
    title: "התקנה במחשב",
    list: [
      { text: "פתחו את תפריט הדפדפן — שלוש הנקודות בפינה, ובספארי את תפריט השיתוף.", icon: DotsIcon },
      { text: 'בחרו "התקנה" או "הוספה ל-Dock".' },
      { text: "אשרו, והאתר ייפתח בחלון משלו." },
    ],
    note: "בדפדפן שלא תומך בהתקנה אפשר פשוט לשמור את הדף כסימנייה.",
  };
}

function InstallSheet({
  open,
  onClose,
  platform,
  canPrompt,
  onInstall,
}: {
  open: boolean;
  onClose: () => void;
  platform: InstallPlatform;
  canPrompt: boolean;
  onInstall: () => Promise<boolean>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // הכרטיס ושורת הפוטר מרנדרים כל אחד חלון משלו באותו עמוד, ולכן ה-id של הכותרת
  // חייב להיות פר-מופע ולא קבוע
  const titleId = useId();
  const { title, list, note } = steps(platform);

  // showModal() הוא מה שנותן לדיאלוג את הרקע המוכהה, לכידת הפוקוס וסגירה ב-Esc —
  // המאפיין `open` לבדו לא נותן אף אחד מהם
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Esc, לחיצה על הרקע וכפתור הסגירה מסתיימים כולם באירוע close של הדיאלוג עצמו,
      // כך שהמצב של ההורה לא יכול להיפרד ממצב הדיאלוג
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby={titleId}
      className="install-sheet"
    >
      <div className="flex flex-col gap-4 p-5 text-right">
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <PhonePlusIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold text-text-strong sm:text-lg">
              {title}
            </h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              {SITE_NAME} עובד כאפליקציה: מסך מלא, פתיחה מיידית, והניקוד שלכם נשמר כרגיל.
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="סגירה"
            className="pressable -ml-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text-strong"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {canPrompt && (
          <button
            type="button"
            onClick={() => {
              void onInstall().then((done) => {
                if (done) ref.current?.close();
              });
            }}
            data-evt="install-sheet-add"
            className="tap pressable inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
          >
            התקנה בלחיצה אחת
          </button>
        )}

        <ol className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-text sm:text-sm">
          {list.map(({ text, icon: Icon }, i) => (
            <li key={text} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                {text}
                {Icon && (
                  <span aria-hidden className="mx-1 inline-flex -translate-y-0.5 align-middle text-accent">
                    <Icon size={16} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>

        {note && <p className="text-xs leading-relaxed text-muted-2">{note}</p>}
      </div>
    </dialog>
  );
}

/* האייקונים inline, כמו בשאר האתר: אין פונט אייקונים ואין בקשה נוספת. */

/** הוספה למסך הבית: טלפון עם פלוס, האפליקציה נוחתת על המכשיר. */
function PhonePlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15.5 3.5H7.7A1.7 1.7 0 0 0 6 5.2v13.6a1.7 1.7 0 0 0 1.7 1.7h8.6a1.7 1.7 0 0 0 1.7-1.7V11" />
      <path d="M10.6 17.6h2.8" />
      <path d="M18 3v5.4" />
      <path d="M15.3 5.7h5.4" />
    </svg>
  );
}

/** כפתור השיתוף של ספארי: ריבוע עם חץ כלפי מעלה. */
function ShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
    </svg>
  );
}

/** תפריט הדפדפן, מצויר כשלוש הנקודות שהוא באמת. */
function DotsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5.5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="18.5" r="1.4" />
    </svg>
  );
}

/**
 * אותו תפריט ב-iOS, שם ספארי מסדר את הנקודות לרוחב. ציור המקבץ האנכי של אנדרואיד ליד
 * "שלוש הנקודות" באייפון שולח אנשים לחפש כפתור שלא נמצא על המסך שלהם, ולכן שני
 * הכיוונים הם שני אייקונים ולא גליף אחד מסובב.
 */
function DotsRowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </svg>
  );
}
