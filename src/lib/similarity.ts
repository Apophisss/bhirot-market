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
 *
 * `duplicateRisk` at the bottom is what the pipeline actually calls: it reads the
 * criteria, the closing times, the cast and the cited articles alongside the
 * title, and names *why* a pair looks alike so the writer knows what to go and
 * read. Two of its reasons block a merge outright: the title score, the one
 * signal measured against a threshold this board has calibrated, and containment
 * (`containment` below), where one question is the other with a qualifier added
 * and a single event decides both — the pair the title score is worst at, since
 * the wider question is short and the narrower one only adds words.
 */

/** Titles at or above this overlap are the same question; merge rejects them. */
export const DUPLICATE_THRESHOLD = 0.8;

/** Hebrew one-letter prefixes (ו/ה/ב/ל/מ/כ/ש) glued onto the front of a word. */
const PREFIX = /^[והבלמכש]/;

/**
 * Strips up to two leading prefix letters, but never down to a stub: "ברהט"
 * becomes "רהט" while "בנט" stays "בנט" (dropping the ב would leave "נט").
 *
 * The second letter only comes off where Hebrew actually stacks two prefixes:
 * after ו ("ומהבחירות"), or when it is the article ה ("מהליכוד" → "ליכוד").
 * Stripping any second prefix letter would take "לליכוד" down to "יכוד" while
 * "מהליכוד" stops at "ליכוד" — one party, two stems, and a pair of questions
 * about it scoring as though they were about different things.
 */
function stem(w: string): string {
  let out = w;
  let stripped = "";
  for (let i = 0; i < 2; i++) {
    if (!PREFIX.test(out) || out.length - 1 < 3) break;
    if (i === 1 && out[0] !== "ה" && stripped !== "ו") break;
    stripped = out[0];
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

/** Every word long enough to carry meaning, scaffolding included. */
function words(s: string): Set<string> {
  return new Set(
    s
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w))
      .map(stem),
  );
}

/** 0 = unrelated, 1 = the same question. Compare against DUPLICATE_THRESHOLD. */
export function similar(a: string, b: string): number {
  const A = distinctive(a);
  const B = distinctive(b);
  // A poll title can be almost entirely scaffolding ("האם ערוץ 14 יפרסם עד 15.9
  // סקר שנותן לליכוד 30 מנדטים ומעלה?" leaves two distinctive words), and a
  // two-word title would score 1.00 against every long title naming the same
  // party. So titles that thin are left to the reader — except when the whole
  // sentence, scaffolding and all, is the same sentence: that is the one case
  // where too few distinctive words must not become a way onto the board.
  if (A.size < 3 || B.size < 3) {
    const all = overlap(words(a), words(b));
    return all >= 0.9 && numbers(a) === numbers(b) ? all : 0;
  }
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  const score = hit / Math.min(A.size, B.size);
  // different thresholds/dates point at different markets — discount, don't excuse
  return numbers(a) === numbers(b) ? score : score * 0.85;
}

/** The distinctive words in the order they are written, first occurrence only. */
function sequence(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    if (w.length <= 2 || /^\d+$/.test(w)) continue;
    const st = stem(w);
    if (st.length <= 2 || SCAFFOLD.has(st) || seen.has(st)) continue;
    seen.add(st);
    out.push(st);
  }
  return out;
}

/**
 * Word order, which `similar` throws away — and which is the whole difference
 * between "גולן תובע את שרה נתניהו" and "שרה נתניהו תובעת את גולן": one word
 * set, two lawsuits, and a 1.00 from `similar`.
 *
 * Rank correlation (Kendall's tau, rescaled to 0..1) over the words the two
 * titles share: 1 when both name them in the same order, 0.5 when the order
 * carries no information, and near 0 when one title reads as the reverse of the
 * other. Bigram overlap was the obvious thing to use here and is not usable —
 * two questions on one subject phrased differently share almost no bigrams, so
 * it calls half the board a mirror.
 */
export function ordered(a: string, b: string): number {
  const A = sequence(a);
  const B = sequence(b);
  const rank = new Map(B.map((w, i) => [w, i] as const));
  const common = A.filter((w) => rank.has(w)).map((w) => rank.get(w)!);
  if (common.length < 3) return 1; // too little shared to say anything about order
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < common.length; i++) {
    for (let j = i + 1; j < common.length; j++) {
      if (common[j] > common[i]) concordant++;
      else discordant++;
    }
  }
  const total = concordant + discordant;
  return total ? (concordant - discordant) / total / 2 + 0.5 : 1;
}

/**
 * The future-tense verbs a question on this board is actually built around.
 *
 * Containment is not about wording, it is about the event: "האם גולן יגיש תביעה
 * עד 31.12" and "האם גולן יגיש בפועל את התביעה עד יום שני" are decided by one
 * filing, and the board carried both at once, priced 58% and 15%. The verb is
 * what says the two sentences are about the same act, so it is matched against a
 * written list rather than guessed from the shape of the word: Hebrew nouns open
 * with the same letters as future-tense verbs ("ישראל", "יהדות", "תעמולה"), and
 * a pattern that accepts them calls half the board one event.
 *
 * "תורה" is deliberately absent although it is a verb ("the committee will
 * order"): on this board it is almost always "יהדות התורה" or "דגל התורה".
 */
const EVENT_VERBS = new Set(
  (
    "יגיש תגיש יגישו יוגש תוגש יפרסם תפרסם יפרסמו יפורסם תפורסם יתפרסם ידווח ידווחו יתייחס תתייחס יתייחסו יגיב תגיב יגיבו " +
    "יבהיר תבהיר יבהירו יודיע תודיע יודיעו יכריז תכריז יכריזו יצהיר תצהיר יצהירו יתקיים תתקיים יתקיימו ייפגש ייפגשו יפגוש " +
    "יפרוש תפרוש יפרשו יתפטר תתפטר יפוטר יודח תודח ימונה יתמנה יאשר תאשר יאשרו יפסול תפסול יפסלו יבטל תבטל ידחה תדחה " +
    "יחתום תחתום יחתמו יעמוד תעמוד יעמדו יקבל תקבל יקבלו יעבור תעבור יעברו יגיע תגיע יגיעו יעלה תעלה ירד תרד יזכה תזכה " +
    "יינעל ייסגר תיסגר יופיע תופיע יתראיין תתראיין יעניק תעניק יעניקו ירוץ תרוץ יתמודד תתמודד יקבע תקבע יסיר תסיר " +
    "ינפיק תנפיק יאחד יתאחד יתאחדו ישוחרר ייעצר יוכרז ימליץ ישלים יעיד תעיד יתייצב ייתן תיתן יראה תראה יעזוב תעזוב " +
    "יצטרף תצטרף יתפצל תתפצל ישובץ תשובץ ייעדר"
  ).split(/\s+/),
);

/** The event verbs a title names, prefixes stripped ("שיפרסם" is "יפרסם"). */
function eventVerbs(title: string): Set<string> {
  const out = new Set<string>();
  for (const w of title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    if (EVENT_VERBS.has(w)) {
      out.add(w);
      continue;
    }
    const root = stem(w);
    if (EVENT_VERBS.has(root)) out.add(root);
  }
  return out;
}

/**
 * The numbers a title quotes that are not its deadline.
 *
 * A threshold is what makes two otherwise identical poll questions two markets —
 * "25 מנדטים ומעלה" and "30 מנדטים ומעלה" are decided by different polls — while
 * the dates and times in the same sentence are only the window. So dates and
 * clock times are removed before the numbers are read, and a pair quoting
 * different quantities is never containment however alike it reads.
 */
function quantities(s: string): string {
  const withoutDates = s.replace(/\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?/g, " ").replace(/\d{1,2}:\d{2}/g, " ");
  return [...withoutDates.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0]).sort().join("|");
}

/** Both questions name a cast, and the shorter list is contained in the longer one. */
function sameCast(a: Comparable, b: Comparable): boolean {
  const A = new Set(a.people ?? []);
  const B = new Set(b.people ?? []);
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((id) => B.has(id)).length;
  return shared === Math.min(A.size, B.size);
}

/** A title's words carry this much of the other's — the containment bar. */
const CONTAIN_WORDS = 0.9;
/** Same cast and same verb this close together in time: one event is deciding both. */
const ONE_EVENT_HOURS = 48;
const ONE_EVENT_TITLE = 0.35;

/**
 * Which of two questions is the broad one, when one contains the other.
 *
 * A containment is a question and the same question with a qualifier bolted on:
 * a venue ("בדברי הפתיחה לישיבת הממשלה"), a step ("בפועל לבית המשפט") or a
 * nearer deadline. One event then resolves both, so the two prices cannot both
 * be right and the board is inconsistent by construction — which is why this is
 * an error and not a warning.
 *
 * Three things have to hold together, and each one is here because on its own it
 * is wrong: the same cast (people alone cannot tell "האם נתניהו יעמוד בראש
 * הממשלה" from "האם איזנקוט יעמוד בראש הממשלה" — both list the same three), the
 * same event verb, and the same quoted quantities. On top of them the broad
 * title's words have to be almost entirely inside the narrow one's, and the
 * broad question must not close first: a shorter question with an *earlier*
 * deadline is a terser question, not a wider one.
 */
export function containment(a: Comparable, b: Comparable): { broad: Comparable; narrow: Comparable } | null {
  if (!sameCast(a, b)) return null;
  const shared = [...eventVerbs(a.title)].filter((v) => eventVerbs(b.title).has(v));
  if (!shared.length) return null;
  if (quantities(a.title) !== quantities(b.title)) return null;
  const wa = words(a.title);
  const wb = words(b.title);
  if (overlap(wa, wb) < CONTAIN_WORDS) return null;
  const broad = wa.size <= wb.size ? a : b;
  const narrow = broad === a ? b : a;
  const broadCloses = new Date(broad.closesAt).getTime();
  const narrowCloses = new Date(narrow.closesAt).getTime();
  if (Number.isFinite(broadCloses) && Number.isFinite(narrowCloses) && broadCloses < narrowCloses) return null;
  return { broad, narrow };
}

/** The fields a duplicate check reads. Both a stored market and a batch entry fit. */
export type Comparable = {
  slug: string;
  title: string;
  resolutionCriteria: string;
  closesAt: string;
  sources: { url: string }[];
  /** ids from data/people.json — the containment screen needs to know it is the same cast */
  people?: string[];
};

/** Named for the editor: each one is a reason to go read the two criteria. */
export type DuplicateReason =
  | "title" // the words of the question itself overlap — merge rejects on this alone
  | "contains" // one question is the other with a qualifier added: one event decides both
  | "one-event" // same cast, same verb, one closing window — probably one event, read both
  | "same-window" // related wording *and* the two deadlines are hours apart
  | "same-criteria" // the two resolution criteria are built from the same words
  | "same-sources" // both questions were written off exactly the same articles
  | "mirror"; // same words, opposite order: usually A→B vs B→A

export type DuplicateRisk = {
  /** "block": merge refuses it. "review": merge wants the writer to say why it is different. */
  level: "block" | "review" | "clear";
  reasons: DuplicateReason[];
  title: number;
  order: number;
  criteria: number;
  sources: number;
  /** hours between the two closing times; the windows overlap when this is small */
  gapHours: number;
  /** on a containment, the slug of the wider question — the one whose window swallows the other */
  broader: string | null;
};

/** Related wording this close together in time is almost always one event. */
const SAME_WINDOW_HOURS = 48;
const SAME_WINDOW_TITLE = 0.6;
/** Criteria are three quarters boilerplate ("יוכרע כן אם ... ידווח ב-ynet ... אחרת לא"), so the bar is high. */
const SAME_CRITERIA = 0.8;
/** Enough shared words to be about one thing, in an order that reads as its reverse. */
const MIRROR_TITLE = 0.65;
const MIRROR_ORDER = 0.35;

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / Math.min(a.size, b.size);
}

/**
 * Everything the machine can say about whether two questions are the same one.
 *
 * It cannot say it on its own. Every signal here is lexical, and on this board
 * the lexical signals are noisy in both directions: "האם נתניהו יעמוד בראש
 * הממשלה הבאה" and "האם איזנקוט יעמוד בראש הממשלה הבאה" share almost every word
 * and are two different markets, while two poll questions on different pollsters
 * and different thresholds are written from the same vocabulary. So a "review"
 * here is not an accusation — it is the list of open questions whose
 * resolutionCriteria the writer has to read before adding another one.
 */
export function duplicateRisk(a: Comparable, b: Comparable): DuplicateRisk {
  const title = similar(a.title, b.title);
  const order = ordered(a.title, b.title);
  const criteria = overlap(distinctive(a.resolutionCriteria), distinctive(b.resolutionCriteria));
  const urlsA = new Set(a.sources.map((s) => s.url));
  const urlsB = new Set(b.sources.map((s) => s.url));
  const sources = overlap(urlsA, urlsB);
  const gapHours = Math.abs(new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()) / 3_600_000;

  const reasons: DuplicateReason[] = [];
  if (title >= DUPLICATE_THRESHOLD) reasons.push("title");
  const contained = containment(a, b);
  if (contained) reasons.push("contains");
  // The near miss of a containment: one cast, one verb, one closing window, but
  // the two sentences are worded far enough apart that nothing above sees them —
  // "יתייחס בפומבי לפסיקה עד ראשון 20:00" and "יתייחס לפסיקה בדברי הפתיחה
  // לישיבת הממשלה" were both open, both priced, and one sentence at the cabinet
  // table decides both. It is review and not a block because the same shape also
  // covers two genuinely different announcements by one spokesman on one evening.
  else if (
    sameCast(a, b) &&
    [...eventVerbs(a.title)].some((v) => eventVerbs(b.title).has(v)) &&
    Number.isFinite(gapHours) &&
    gapHours <= ONE_EVENT_HOURS &&
    overlap(distinctive(a.title), distinctive(b.title)) >= ONE_EVENT_TITLE
  ) {
    reasons.push("one-event");
  }
  if (title >= SAME_WINDOW_TITLE && Number.isFinite(gapHours) && gapHours <= SAME_WINDOW_HOURS) reasons.push("same-window");
  if (criteria >= SAME_CRITERIA) reasons.push("same-criteria");
  if (sources === 1 && urlsA.size >= 2 && urlsA.size === urlsB.size) reasons.push("same-sources");
  if (title >= MIRROR_TITLE && order <= MIRROR_ORDER) reasons.push("mirror");

  // A mirror is the one shape where the title score is wrong in both directions:
  // the words are identical, so `similar` says 1.00, and the two questions are as
  // often opposites as they are twins — "גולן תובע את שרה נתניהו" and "שרה
  // נתניהו תובעת את גולן" are two lawsuits and a board carrying both is right.
  // Blocking outright would silently lose the second one, so a mirror comes down
  // to review: it is still refused until someone writes what resolves each.
  // A containment blocks even when the two titles score low against each other:
  // the whole point is that the wider question is short and the narrow one adds
  // words, so `similar` can be told they are different questions right up to the
  // moment one event settles both.
  const level =
    reasons.includes("contains") || (reasons.includes("title") && !reasons.includes("mirror"))
      ? "block"
      : reasons.length
        ? "review"
        : "clear";
  return { level, reasons, title, order, criteria, sources, gapHours, broader: contained?.broad.slug ?? null };
}

/** One line an editor can read, in the language the rest of the pipeline speaks. */
export const REASON_TEXT: Record<DuplicateReason, string> = {
  title: "הכותרות חופפות מעל הסף — merge דוחה",
  contains: "שאלה אחת מכילה את השנייה — אותו אירוע מכריע את שתיהן",
  "one-event": "אותם אנשים, אותו פועל ואותו חלון סגירה — קראו את שתי ההכרעות",
  "same-window": "ניסוח קרוב ומועדי סגירה במרחק שעות — כנראה אותו אירוע",
  "same-criteria": "קריטריוני ההכרעה בנויים מאותן מילים",
  "same-sources": "שתי השאלות נכתבו בדיוק מאותן כתבות",
  mirror: "אותן מילים בסדר הפוך — בדקו שזו לא אותה שאלה משני הכיוונים",
};
