/**
 * Fabricated discussion under a question.
 *
 * DISPLAY ONLY, exactly like `fake-market-stats.ts` beside it: nothing here is
 * written to the `comments` table, nothing is attributed to a real account, and no
 * fabricated row can be replied to, moderated or counted anywhere the real numbers
 * are counted. The admin dashboard and the analysis bundle keep reading the real
 * table.
 *
 * The names are the same pseudonyms the leaderboard uses (`handleForSlot`), which
 * is the one choice here that is not cosmetic: the board is anonymous by design, so
 * a fabricated commenter must not wear a human-looking name that a visitor could go
 * looking for. "ינשוף זהיר" is visibly a handle, and it is the same kind of handle
 * every real trader wears on /leaderboard.
 *
 * The bodies are deliberately generic market talk — about price, timing, thin
 * markets and waiting for the next poll. None of them makes a factual claim about
 * any candidate, party, poll or event, so a fabricated comment cannot put a false
 * statement about a real person under a real question.
 */

import { hash32, hashString, unit } from "./hash";
import { handleForSlot, HANDLE_SLOTS } from "./fake-leaderboard";

const MINUTE = 60_000;

/** the most fabricated comments any question carries */
export const FAKE_COMMENTS_MAX = 7;
/** the fewest — a question is never silent */
export const FAKE_COMMENTS_MIN = 2;

/**
 * How far back the newest fabricated comment sits, so the thread never looks staged
 * — a page that always opens with something posted "לפני דקה" gives itself away.
 *
 * It yields to the question's own age: a question opened ten minutes ago cannot have
 * a forty-minute-old thread under it, and a comment dated before the question existed
 * is a worse tell than a fresh one. Below `FAKE_COMMENT_MIN_AGE_MS` of age the thread
 * is packed into the question's first minutes instead.
 */
export const FAKE_COMMENT_MIN_AGE_MS = 40 * MINUTE;

/** the window a too-young question's thread is spread over instead */
export const FAKE_COMMENT_YOUNG_SPAN_MS = 2 * MINUTE;

/**
 * Generic market talk. Every line has to work under *any* binary question on the
 * board — that is what keeps a fabricated comment from asserting something about a
 * real person or a real event.
 */
const BODIES: readonly string[] = [
  "המחיר פה נראה לי גבוה מדי. נכנסתי בלא.",
  "לקחתי פוזיציה קטנה, עדיין מוקדם להיכנס בגדול.",
  "השוק הזה מגיב לאט מדי לחדשות, יש כאן הזדמנות.",
  "כללי ההכרעה כאן ברורים. זה מה שאני אוהב בשאלות האלה.",
  "התלבטתי הרבה על השאלה הזאת ובסוף הלכתי עם ההיגיון ולא עם התחושה.",
  "לדעתי מתמחרים כאן יותר מדי רגש ופחות מדי נתונים.",
  "מכרתי חצי מהפוזיציה, הרווח היה מספיק טוב בשבילי.",
  "מה שיקבע כאן זה הטיימינג, לא התוצאה עצמה.",
  "אני בשוק הזה כבר שבועיים והמחיר כמעט לא זז.",
  "שוק דק. כל קנייה בודדת מזיזה את המחיר בכמה נקודות.",
  "הייתי שם על זה הרבה יותר אם התקרה לעסקה הייתה גבוהה יותר.",
  "מסכים עם התמחור הנוכחי, נראה לי די מדויק.",
  "לא מבין איך זה עדיין מתחת לחמישים.",
  "לא מבין איך זה כבר מעל חמישים.",
  "בסוף זה תמיד מתגלגל אחרת ממה שכולם חושבים.",
  "שאלה טובה. אין הרבה שאפשר באמת להכריע בלי ויכוחים.",
  "נכנסתי בהתחלה ויצאתי ברווח קטן. מרוצה.",
  "אני נשאר בחוץ עד שיהיה משהו קונקרטי לתמחר.",
  "עקבתי אחרי זה כמה ימים והמגמה די ברורה.",
  "כדאי לחכות עם זה לימים האחרונים לפני הסגירה.",
  "יש כאן יותר רעש מאינפורמציה כרגע.",
  "המחיר תיקן את עצמו מאז שנכנסתי, טוב שנשארתי.",
  "לא הייתי מהמר על זה בכסף אמיתי. כאן, למה לא.",
  "מי שקונה כאן צריך לקרוא שוב את כללי ההכרעה.",
  "השוק מתמחר את זה כאילו כבר הוכרע. מוקדם מדי.",
  "נכנסתי הפוך לשוק ואני עדיין חושב שאני צודק.",
  "הפוזיציה הזאת בעיקר בשביל לפזר, לא בשביל להרוויח.",
  "מחכה לנתונים הבאים לפני שאני מזיז משהו.",
  "בפעם הקודמת שהיה מצב דומה זה נגמר בדיוק הפוך.",
  "הכל תלוי במה שיקרה בשבועות הקרובים. עד אז אני בחוץ.",
  "הוספתי לפוזיציה אחרי הירידה. נראה לי שהשוק הגזים.",
  "אחת השאלות היותר מעניינות שיש כאן כרגע.",
] as const;

export interface FakeComment {
  id: string;
  body: string;
  createdAt: Date;
  userName: string;
  userImage: null;
}

function ms(t: Date | number): number {
  const n = t instanceof Date ? t.getTime() : Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** how many fabricated comments a question carries — fixed by its id, so it never changes */
export function fakeCommentCount(id: string): number {
  const h = hashString(id);
  return FAKE_COMMENTS_MIN + (hash32(h, 0x81) % (FAKE_COMMENTS_MAX - FAKE_COMMENTS_MIN + 1));
}

/**
 * The fabricated thread under one question, newest first.
 *
 * Timestamps are spread over the question's life and stop `FAKE_COMMENT_MIN_AGE_MS`
 * short of now, so the thread ages naturally instead of always showing something
 * posted "לפני דקה" the moment a visitor lands. A question that closed keeps the
 * thread it had when it closed.
 */
export function fakeComments(
  m: { id: string; createdAt: Date | number; closesAt: Date | number; status: string },
  now = Date.now(),
): FakeComment[] {
  const count = fakeCommentCount(m.id);
  const h = hashString(m.id);
  const active = m.status === "open" ? now : Math.min(now, ms(m.closesAt) || now);
  const start = Math.min(ms(m.createdAt), active);
  // the newest a comment here may be — never before the question opened, and never
  // inside the last FAKE_COMMENT_MIN_AGE_MS once the question is old enough for that
  const latest = Math.max(Math.min(start + FAKE_COMMENT_YOUNG_SPAN_MS, active), active - FAKE_COMMENT_MIN_AGE_MS);
  const span = Math.max(FAKE_COMMENT_YOUNG_SPAN_MS, latest - start);

  const used = new Set<number>();
  const out: FakeComment[] = [];
  for (let i = 0; i < count; i++) {
    const k = hash32(h, 0x91 + i);
    // probe forward so one question never shows the same line twice
    let b = k % BODIES.length;
    for (let probe = 0; probe < BODIES.length && used.has(b); probe++) b = (b + 1) % BODIES.length;
    used.add(b);
    // comments cluster towards the recent end of a question's life, as real ones do
    const back = span * (1 - unit(hash32(k, 0x02)) ** 1.8);
    out.push({
      id: `f:${m.id}:${i}`,
      body: BODIES[b],
      createdAt: new Date(Math.min(latest, Math.max(start, latest - back))),
      userName: handleForSlot(hash32(k, 0x03) % HANDLE_SLOTS),
      userImage: null,
    });
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * The thread as the market page paints it: the fabricated comments merged with the
 * real ones, newest first. Real comments keep their own ids, names and avatars —
 * the merge only decides the order.
 */
export function mergeComments<T extends { createdAt: Date | string | number }>(
  real: T[],
  fabricated: FakeComment[],
): (T | FakeComment)[] {
  return [...real, ...fabricated].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
