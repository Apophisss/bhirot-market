import { getPerson } from "./content";

/**
 * המועמדים לראשות הממשלה שמוצגים בעמוד הראשי.
 * העדכון ידני (כמו `ELECTION_DATE`): אם ראש רשימה מרכזי פורש או מצטרף — עדכנו כאן.
 * ה-`id` חייב להתאים למזהה ב-`data/people.json` (ומשם מגיעים השם והתמונה).
 */
export interface PmCandidate {
  id: string;
  /** הרשימה שהוא עומד בראשה */
  list: string;
  /** משפט קצר שמופיע מתחת לשם */
  note: string;
}

export const PM_CANDIDATES: PmCandidate[] = [
  { id: "benjamin-netanyahu", list: "הליכוד", note: "ראש הממשלה המכהן" },
  { id: "gadi-eisenkot", list: "ישר!", note: "רמטכ״ל לשעבר" },
  { id: "naftali-bennett", list: "ביחד", note: "ראש ממשלה לשעבר" },
  { id: "yair-lapid", list: "ביחד", note: "יו״ר האופוזיציה" },
  { id: "yair-golan", list: "הדמוקרטים", note: "אלוף במיל׳" },
  { id: "avigdor-lieberman", list: "ישראל ביתנו", note: "שר הביטחון לשעבר" },
  { id: "benny-gantz", list: "כחול לבן", note: "רמטכ״ל לשעבר" },
];

export interface PmCandidateView extends PmCandidate {
  name: string;
  image: string;
  role?: string;
}

/** המועמדים שיש להם רשומה (ותמונה) ב-data/people.json, לפי סדר התצוגה שלמעלה. */
export function listPmCandidates(): PmCandidateView[] {
  const out: PmCandidateView[] = [];
  for (const c of PM_CANDIDATES) {
    const p = getPerson(c.id);
    if (!p?.image) continue;
    out.push({ ...c, name: p.name, image: p.image, role: p.role });
  }
  return out;
}

export function isPmCandidate(id: string): boolean {
  return PM_CANDIDATES.some((c) => c.id === id);
}
