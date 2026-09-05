import { useEffect, useSyncExternalStore } from "react";
import { RAPID_DEFAULT_STAKE, clampStake } from "./rapid";
import type { SettingsPatch } from "./settings";

/**
 * צד הדפדפן של הגדרות המשתמש (`settings.ts`).
 *
 * הכלל אחד, והוא מה שהופך את האתר לאותו אתר בכל מכשיר:
 *
 *   מחובר → החשבון הוא האמת. השרת מרנדר את הערך השמור, וכל שינוי נשלח אליו.
 *   אורח  → `localStorage` הוא האמת, כי אין לו שום דבר אחר; ובהתחברות מה שבחר
 *            מאומץ לחשבון (`claimGuestSettings`) במקום להימחק.
 *
 * לכן משתמש מחובר לא כותב יותר ל-`localStorage`: ערך מקומי שמנצח את החשבון הוא
 * בדיוק הבאג שהיה כאן — הטלפון והמחשב מחזיקים שני מספרים שונים ושניהם "נכונים".
 * המפתח המקומי קיים מעכשיו רק כשמי שכתב אותו היה אורח, וזה מה שמאפשר לאמץ אותו
 * פעם אחת ואז למחוק אותו.
 */

const STAKE_KEY = "bhirot:rapid:stake";
/** כמה להמתין אחרי הזזת הסליידר לפני שמדווחים לשרת — גרירה אחת, שמירה אחת */
const SAVE_DEBOUNCE_MS = 600;

/** מה שנבחר בלשונית הזאת אחרי שהדף עלה, ועוד לא חזר מהשרת. null = מה שהשרת אמר. */
let override: number | null = null;
/** הערך האחרון שהלשונית הזאת שלחה לשרת — כדי לזהות ערך שמישהו אחר שינה */
let lastPushed: number | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** הסכום ששמור בדפדפן, או null אם מעולם לא נשמר כאן אחד. */
export function readStoredStake(): number | null {
  try {
    const raw = window.localStorage.getItem(STAKE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? clampStake(n) : null;
  } catch {
    // גלישה פרטית או אחסון חסום — כמו מי שלא בחר מעולם
    return null;
  }
}

/** הקריאה מהאחסון נעשית פעם אחת ללשונית: `getSnapshot` נקרא בכל רינדור. */
let storedCache: number | null | undefined;

function storedStake(): number | null {
  if (storedCache === undefined) storedCache = readStoredStake();
  return storedCache;
}

function writeStoredStake(v: number | null) {
  storedCache = v;
  try {
    if (v == null) window.localStorage.removeItem(STAKE_KEY);
    else window.localStorage.setItem(STAKE_KEY, String(v));
  } catch {
    /* גלישה פרטית: הבחירה תחזיק לרצה הזאת ולא מעבר לה */
  }
}

function snapshot(saved: number | null): number {
  if (override != null) return override;
  if (saved != null) return saved;
  return storedStake() ?? RAPID_DEFAULT_STAKE;
}

/**
 * הסכום לכל תשובה. `saved` הוא מה שהחשבון שמר (ומגיע מהשרת), או null לאורח.
 *
 * לא נקרא מ-`localStorage` בזמן רינדור של משתמש מחובר: הערך מגיע מהשרת ולכן
 * הרינדור הראשון בדפדפן זהה לזה של השרת — בלי הבהוב של ₪20 לפני שהסכום שנבחר
 * מופיע, ובלי אי-התאמה בהידרציה.
 */
export function useRapidStake(saved: number | null): number {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot(saved),
    () => saved ?? RAPID_DEFAULT_STAKE,
  );

  // ערך שהשרת מספר עליו ולא אנחנו שלחנו אותו הוא מכשיר אחר שדיבר — הוא מנצח את
  // מה שנבחר כאן לפני הרענון, אחרת הלשונית הזאת תישאר לנצח עם מספר שאיש כבר לא
  // מחזיק. אחרי הרינדור, לא בתוכו: הקריאה חייבת להישאר טהורה.
  useEffect(() => {
    if (saved == null || override == null) return;
    if (saved === lastPushed || saved === override) return;
    override = null;
    lastPushed = null;
    notify();
  }, [saved]);

  return value;
}

/**
 * בוחר סכום. `remote` = יש חשבון לשמור בו.
 *
 * המסך מתעדכן מיד, והשמירה יוצאת אחריו: בחירת סכום היא לא פעולה שממתינים לה,
 * והכישלון היחיד שאפשר לספוג כאן הוא סכום שלא נשמר — לא תשובה שלא נקלטה.
 */
export function setRapidStake(value: number, remote: boolean): void {
  const next = clampStake(value);
  override = next;
  notify();
  if (remote) {
    lastPushed = next;
    queueSettings({ rapidStake: next });
  } else {
    writeStoredStake(next);
  }
}

/* ------------------------------------------------------ השמירה אל השרת -- */

let queued: SettingsPatch = {};
let timer = 0;
let unloadBound = false;

function send(patch: SettingsPatch, keepalive: boolean): Promise<unknown> {
  return fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
    keepalive,
  }).catch(() => {
    // אין כאן ניסיון חוזר בכוונה: ההעדפה תישלח שוב בשינוי הבא, והמסך כבר מראה
    // את מה שנבחר. מה שאסור לאבד — התשובות עצמן — לא עובר כאן
    return null;
  });
}

/** שולח עכשיו את מה שממתין (יציאה מהדף, מעבר ללשונית אחרת). */
export function flushSettings(keepalive = true): void {
  if (timer) {
    window.clearTimeout(timer);
    timer = 0;
  }
  const patch = queued;
  queued = {};
  if (Object.keys(patch).length) void send(patch, keepalive);
}

/** מצרף שינוי לשמירה מושהית — גרירה של הסליידר היא בקשה אחת, לא שלושים. */
export function queueSettings(patch: SettingsPatch): void {
  queued = { ...queued, ...patch };
  if (typeof window === "undefined") return;
  if (!unloadBound) {
    unloadBound = true;
    // `pagehide` הוא האירוע שמגיע גם כשמסך נסגר בטלפון, ששם `beforeunload` לא נורה
    window.addEventListener("pagehide", () => flushSettings());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushSettings();
    });
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = 0;
    flushSettings(false);
  }, SAVE_DEBOUNCE_MS);
}

/**
 * מאמץ לחשבון את מה שנבחר לפני ההתחברות, פעם אחת.
 *
 * השרת ממלא רק את מה שהחשבון עוד לא בחר (`claimSettings`), ולכן זה בטוח גם
 * כשמתחברים לחשבון ותיק. אחרי אימוץ מוצלח המפתח המקומי נמחק: מכאן ואילך
 * החשבון הוא האמת, ומה שנשאר בדפדפן היה רק מסתיר אותה.
 */
export async function claimGuestSettings(): Promise<void> {
  const stake = readStoredStake();
  if (stake == null) return;
  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rapidStake: stake }),
    });
    if (!res.ok) return;
    writeStoredStake(null);
    override = null;
    notify();
  } catch {
    // נשאר בדפדפן וינוסה שוב בהתחברות הבאה
  }
}
