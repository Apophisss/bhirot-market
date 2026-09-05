/**
 * `appeal` — how good a question the editor who wrote it thinks it is.
 *
 * Everything else the recommendation engine knows about a question is measured
 * after the fact: how much money moved through it, how many people answered it,
 * how close its deadline is. None of that exists in the first hours of a new
 * question's life, and a question that never gets surfaced never gets the
 * activity that would surface it — the cold-start loop the board loses its
 * best questions to.
 *
 * The person who wrote the question already knows the answer. "This one is a
 * conversation starter" and "this one is a technical completeness question" are
 * judgements they make while writing it, and this field is where that judgement
 * is written down: one number, 1..5, given by the creator (the editorial routine,
 * the generator, or a human on the admin form) and read by `recommendations.ts`
 * as a real term in the ranking — see `appealBoost`.
 *
 * The scale is deliberately small and its middle is the default: a question
 * nobody rated sits at `APPEAL_DEFAULT` and is neither promoted nor buried, so
 * the whole board does not have to be re-rated for the field to mean something.
 *
 * Kept free of any data import so the admin form can use the labels without
 * pulling data/markets.json into the client bundle.
 */

export const APPEAL_MIN = 1;
export const APPEAL_MAX = 5;
/** An unrated question. Contributes nothing to the score, in either direction. */
export const APPEAL_DEFAULT = 3;

/**
 * How much of the ranking the creator's judgement is allowed to carry, as the
 * full swing from the neutral 3 to either end of the scale.
 *
 * It is deliberately large — the whole point of the field is that an editor
 * saying "this is the question of the day" should actually move the board — but
 * still under the personal-taste term (1.6) and the popularity term (1.4) in
 * `scoreCandidate`: a great question in a category the user never touches does
 * not get to push out a question they actually trade, and a real trading wave
 * on a plain question still beats an editor's hunch about a quiet one.
 */
export const APPEAL_WEIGHT = 1.2;

export interface AppealLevel {
  value: number;
  /** the word the creator picks in the admin form */
  label: string;
  /** what picking it actually means, in one line */
  hint: string;
}

/** The scale as the creator sees it, from the dullest question to the best one. */
export const APPEAL_LEVELS: AppealLevel[] = [
  { value: 1, label: "טכנית", hint: "שאלה שסוגרת פינה. לא הייתי שולח אותה לאף אחד." },
  { value: 2, label: "סבירה", hint: "בסדר גמור, אבל לא תעצור אף אחד באמצע גלילה." },
  { value: 3, label: "רגילה", hint: "ברירת המחדל: שאלה טובה כמו רוב הלוח." },
  { value: 4, label: "מעניינת", hint: "יש בה סיפור. אנשים ירצו לראות איך היא נגמרת." },
  { value: 5, label: "מגניבה", hint: "השאלה של היום. עליה מדברים, עליה מתווכחים." },
];

export function appealLevel(value: number): AppealLevel {
  return APPEAL_LEVELS.find((l) => l.value === clampAppeal(value)) ?? APPEAL_LEVELS[APPEAL_DEFAULT - 1];
}

/** Any number, any missing value, folded onto the scale. Never NaN. */
export function clampAppeal(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return APPEAL_DEFAULT;
  return Math.min(APPEAL_MAX, Math.max(APPEAL_MIN, Math.round(value)));
}

/**
 * The ranking term, signed around the neutral default: `-APPEAL_WEIGHT` for a 1,
 * exactly 0 for an unrated question, `+APPEAL_WEIGHT` for a 5.
 *
 * Signed rather than 0..1 on purpose. An unrated board must rank exactly as it
 * did before the field existed, so the neutral value has to contribute nothing —
 * and an editor who marks a question as filler should be able to push it down,
 * not merely fail to push it up.
 */
export function appealBoost(value: number | null | undefined): number {
  return (APPEAL_WEIGHT * (clampAppeal(value) - APPEAL_DEFAULT)) / (APPEAL_MAX - APPEAL_DEFAULT);
}
