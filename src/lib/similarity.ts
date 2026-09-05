/**
 * Duplicate detection for Hebrew prediction questions.
 *
 * Shared by scripts/merge-markets.ts (which rejects a new question outright)
 * and scripts/audit-markets.ts (which reports the pairs already on the board),
 * so the number the audit prints is the number merge will act on.
 *
 * Plain word overlap is useless here: almost every title is built from the same
 * scaffolding ("האם … יפרסם … סקר … מנדטים … עד"), so unrelated questions about
 * different parties score 0.7+ against each other. Two questions count as the
 * same only when their *distinctive* words overlap heavily. Hebrew glues its
 * prepositions onto the next word — "עוצמה" / "ועוצמה" / "לעוצמה" are the same
 * word to a reader and three different strings to a Set — so words are stripped
 * of leading prefix letters before they are compared. Quoting different numbers
 * (a different seat threshold, pollster or date) is evidence of two genuinely
 * different markets, but weak evidence: it discounts the score rather than
 * zeroing it, so "רע"ם מעל 60% ברהט" still registers against "רע"ם 55% ברהט".
 *
 * This is a screen, not a verdict. Two questions are the same when they resolve
 * on the same event, and titles carry only part of that: "האם הרשימה המשותפת
 * תקבל יותר מנדטים מרע"ם" and "האם רע"ם תקבל יותר מנדטים מהרשימה המשותפת" are
 * one market wearing two titles and score 0.28 here. Nothing below the threshold
 * is cleared — it is only unflagged; the resolutionCriteria still have to be read.
 */

/** Titles at or above this overlap are the same question; merge rejects them. */
export const DUPLICATE_THRESHOLD = 0.8;

/** Hebrew one-letter prefixes (ו/ה/ב/ל/מ/כ/ש) glued onto the front of a word. */
const PREFIX = /^[והבלמכש]/;

/**
 * Strips up to two leading prefix letters, but never down to a stub: "ברהט"
 * becomes "רהט" while "בנט" stays "בנט" (dropping the ב would leave "נט").
 */
function stem(w: string): string {
  let out = w;
  for (let i = 0; i < 2; i++) {
    if (!PREFIX.test(out) || out.length - 1 < 3) break;
    out = out.slice(1);
  }
  return out;
}

const SCAFFOLD = new Set(
  [
    "האם", "עד", "של", "את", "על", "לא", "כן", "יהיה", "תהיה", "יהיו", "יגיש", "יגישו", "יפרסם", "יפורסם",
    "יתפרסם", "יקבל", "תקבל", "יקבלו", "יעבור", "תעבור", "יעברו", "יודיע", "תודיע", "יודיעו", "סקר", "בסקר",
    "סקרים", "מנדט", "מנדטים", "רשימה", "רשימת", "רשימות", "משותפת", "מפלגה", "מפלגת", "ועדת", "לוועדת",
    "הבחירות", "בחירות", "המרכזית", "ומעלה", "לפחות", "יותר", "פחות", "לפני", "אחרי", "בתוצאות", "הרשמיות",
    "תוצאות", "כלשהו", "כלשהי", "אחד", "אחת", "שני", "שתי", "חדשות", "ערוץ", "כאן", "בכנסת", "כנסת", "הכנסת",
    "ראש", "הממשלה", "ממשלה", "יום", "בערב", "בבוקר", "שבת", "ראשון", "בספטמבר", "באוקטובר", "בנובמבר",
    "השאלה", "מועד", "המועד", "האחרון", "האחרונה", "הקרוב", "הקרובה", "בין", "עם", "נגד", "כדי", "שבו", "שבה",
    "הוא", "היא", "הם", "הן", "זה", "זו", "גם", "אם", "או",
  ].map(stem),
);

/** The words that actually say what a question is about. */
export function distinctive(s: string): Set<string> {
  return new Set(
    s
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w))
      .map(stem)
      .filter((w) => w.length > 2 && !SCAFFOLD.has(w)),
  );
}

function numbers(s: string): string {
  return [...s.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0]).sort().join("|");
}

/** 0 = unrelated, 1 = the same question. Compare against DUPLICATE_THRESHOLD. */
export function similar(a: string, b: string): number {
  const A = distinctive(a);
  const B = distinctive(b);
  // a two-word title would score 1.00 against every long title naming the same
  // party, so titles that thin are left to the reader rather than scored
  if (A.size < 3 || B.size < 3) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  const overlap = hit / Math.min(A.size, B.size);
  // different thresholds/dates point at different markets — discount, don't excuse
  return numbers(a) === numbers(b) ? overlap : overlap * 0.85;
}
