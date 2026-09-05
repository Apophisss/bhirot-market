/**
 * הצנרת של "הוספה למסך הבית".
 *
 * מאחורי פיצ'ר אחד מסתתרות שתי פלטפורמות שונות לגמרי. אנדרואיד (וכרומיום בדסקטופ)
 * יורים `beforeinstallprompt` — אירוע שאפשר לתפוס, לשמור ולשחזר אחר כך כדיאלוג התקנה
 * אמיתי של מערכת ההפעלה, בלחיצה אחת. iOS לא יורה כלום ולא חושף שום API: "הוספה למסך
 * הבית" של ספארי חיה בתוך תפריט השיתוף ואפשר להגיע אליה רק ידנית, ולכן שם המקסימום
 * שאפשר לעשות הוא להראות את הצעדים. כל מה שכאן עוסק בהבחנה בין שני המקרים האלה,
 * ובכך שלא נשאל פעמיים אחרי שמישהו כבר אמר לא.
 *
 * המודול נטען בדפדפן בלבד (נקרא מ-`src/components/InstallApp.tsx`) ואין לו תלויות.
 */

export type InstallPlatform = "ios" | "android" | "desktop";

/** לא קיים ב-lib.dom.d.ts: כרומיום בלבד, ועדיין לא תקני. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    /**
     * האירוע התפוס, שהסקריפט הפנימי ב-layout.tsx מחנה כאן. `beforeinstallprompt`
     * נורה בדרך כלל לפני ש-React הספיק לעשות hydrate, ולכן מאזין שנרשם מתוך קומפוננטה
     * היה מפספס אותו לגמרי — הסקריפט תופס אותו מוקדם, וכל קומפוננטה קוראת אותו מכאן.
     */
    __bmInstallPrompt?: BeforeInstallPromptEvent | null;
    /**
     * נדלק ברגע שידוע שההתקנה קרתה. אף אחד משני הסימנים שהפלטפורמה נותנת לא מספיק
     * לבד: באנדרואיד הטאב שממנו התקינו ממשיך לרוץ בדפדפן ולכן לעולם לא הופך
     * ל-standalone, וכל קומפוננטה שמוצגת צריכה לגנוז את ההצעה שלה באותו רגע עצמו.
     */
    __bmInstalled?: boolean;
  }
}

/** נורה על window בכל פעם שהאירוע התפוס מופיע או מנוצל. */
export const INSTALLABLE_EVENT = "bm:installable";

const SNOOZE_KEY = "bm_install_snoozed";

/** מספיק ארוך כדי לכבד "לא עכשיו", מספיק קצר כדי לשאול שוב לפני הבחירות. */
const SNOOZE_DAYS = 30;

export function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;

  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // אייפד מ-iPadOS 13 מדווח על עצמו כספארי של מק; מספר נקודות המגע הוא מה שעדיין מסגיר אותו
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";

  return "desktop";
}

/** אמת ברגע שהאתר מותקן — רץ ממסך הבית, או שזה עתה נוסף. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__bmInstalled) return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // ב-iOS מעולם לא מומש display-mode לאפליקציות מסך הבית
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** רושם את ההתקנה וגונז בבת אחת כל הצעה שמוצגת בעמוד. */
export function markInstalled(): void {
  if (typeof window === "undefined") return;
  window.__bmInstalled = true;
  clearInstallPrompt();
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__bmInstallPrompt ?? null;
}

/**
 * זורק את האירוע התפוס ומודיע על כך לכל קומפוננטה שמוצגת. הדפדפן מכבד רק `prompt()`
 * אחד לכל אירוע, ולכן ברגע שהוא נוצל — או ברגע שהאתר הותקן — אסור להציע אותו שוב.
 */
export function clearInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.__bmInstallPrompt = null;
  window.dispatchEvent(new Event(INSTALLABLE_EVENT));
}

export function isSnoozed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const until = Number(window.localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function snooze(days: number = SNOOZE_DAYS): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 86_400_000));
  } catch {
    // גלישה פרטית: ההצעה פשוט תחזור בביקור הבא
  }
}
