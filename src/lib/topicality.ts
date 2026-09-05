/**
 * `topicality` — how tied to *right now* the question is, as the editor who wrote
 * it sees it, and how that claim fades.
 *
 * `appeal` (`./appeal`) answers "how good a question is this?", and that answer is
 * true for as long as the question is open. This field answers a question with a
 * shelf life: "is this what people are hearing on the news this evening?". A market
 * written twenty minutes after a poll drops, or after a party announces a merger,
 * should be the first thing a visitor sees — and three days later it is just another
 * question on the board, even though nothing about it changed.
 *
 * So the field is a pair, not a number: the rating the creator gives (1..5, below)
 * and the market's own `createdAt`. `topicalityBoost` combines them into the term
 * `recommendations.ts` adds to the score — full strength in the first hour, halved
 * every `TOPICALITY_HALF_LIFE_HOURS`, effectively gone within a week. The clock is
 * the creation date on purpose: a news hook is dated by the event that produced it,
 * and an editor who later re-rates an old market gets only what is left of the decay,
 * not a fresh promotion. A story that comes back is a new question.
 *
 * The neutral value is the *bottom* of the scale, unlike `appeal`: a question with
 * no news hook is a perfectly good question (most of the board is), so 1 contributes
 * exactly nothing and nothing is ever pushed down for being evergreen. That also
 * means an un-rated board — every market written before this field existed — ranks
 * precisely as it did before.
 *
 * Kept free of any data import so the admin form can render the scale without
 * pulling data/markets.json into the client bundle.
 */

export const TOPICALITY_MIN = 1;
export const TOPICALITY_MAX = 5;
/** No news hook. The default, and worth nothing in either direction. */
export const TOPICALITY_DEFAULT = 1;

/**
 * What a brand new 5 is worth in the ranking, before any decay.
 *
 * Deliberately the largest single term in `scoreCandidate` at that one moment —
 * above the popularity ceiling (1.4) and the creator's appeal rating (1.2) — because
 * that is the whole point: the question written minutes after the news broke has no
 * volume, no traders and no comments, and it has to reach the top of the board on the
 * strength of its timing alone. It is also the term that disappears fastest: by two
 * days it is worth less than `appeal`, and by a week it is noise.
 */
export const TOPICALITY_WEIGHT = 1.5;

/**
 * How long half of the boost survives — one Israeli news cycle and a bit.
 *
 * Shared by every level rather than scaled per level, so a 5 outranks a 4 at every
 * age and the order the editor set never inverts on its own. The rating chooses how
 * high the question starts; time alone decides how fast it comes down.
 */
export const TOPICALITY_HALF_LIFE_HOURS = 36;

/** From this much heat (0..1) up, the pick is worth explaining as a news pick. */
export const TOPICALITY_REASON_THRESHOLD = 0.45;
/** ...and from here up, in the strongest wording the card has. */
export const TOPICALITY_HOT_THRESHOLD = 0.8;

export interface TopicalityLevel {
  value: number;
  /** the word the creator picks in the admin form */
  label: string;
  /** what picking it actually means, in one line */
  hint: string;
}

/** The scale as the creator sees it, from a question with no news hook to a breaking one. */
export const TOPICALITY_LEVELS: TopicalityLevel[] = [
  { value: 1, label: "כללית", hint: "לא תלויה בחדשות של היום. תהיה מעניינת בדיוק אותו דבר בעוד חודש." },
  { value: 2, label: "רקע", hint: "נשענת על סיפור מתגלגל, לא על כותרת של היום." },
  { value: 3, label: "בחדשות", hint: "הנושא היה בחדשות השבוע, אבל לא היום." },
  { value: 4, label: "כותרת היום", hint: "זה בעמוד הראשי של ynet עכשיו. מי שקורא חדשות היום ראה את זה." },
  { value: 5, label: "מבזק", hint: "קרה בשעות האחרונות, וכולם מדברים על זה ברגע הזה." },
];

export function topicalityLevel(value: number): TopicalityLevel {
  return TOPICALITY_LEVELS.find((l) => l.value === clampTopicality(value)) ?? TOPICALITY_LEVELS[0];
}

/** Any number, any missing value, folded onto the scale. Never NaN. */
export function clampTopicality(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return TOPICALITY_DEFAULT;
  return Math.min(TOPICALITY_MAX, Math.max(TOPICALITY_MIN, Math.round(value)));
}

/** 0..1 — how much of the scale the rating claims. A 1 claims nothing. */
export function topicalityStrength(value: number | null | undefined): number {
  return (clampTopicality(value) - TOPICALITY_MIN) / (TOPICALITY_MAX - TOPICALITY_MIN);
}

/**
 * What is left of a news hook after `now - createdAt`: 1 at publication, 0.5 after one
 * half-life, and so on. A market dated in the future (a clock skew, a hand-written
 * `createdAt`) counts as brand new rather than as more than new.
 */
export function topicalityDecay(createdAt: number, now: number): number {
  const hours = Math.max(0, (now - createdAt) / 3_600_000);
  return 0.5 ** (hours / TOPICALITY_HALF_LIFE_HOURS);
}

/**
 * 0..1 — how hot this question is right now: the creator's claim, times what time
 * has left of it. This is the number the card's reason is worded from.
 */
export function topicalityHeat(value: number | null | undefined, createdAt: number, now: number): number {
  return topicalityStrength(value) * topicalityDecay(createdAt, now);
}

/**
 * The ranking term. Never negative: a question with no news hook is not demoted for
 * it, it simply does not get the lift.
 */
export function topicalityBoost(value: number | null | undefined, createdAt: number, now: number): number {
  return TOPICALITY_WEIGHT * topicalityHeat(value, createdAt, now);
}

/** How long a rating stays worth at least `heat`, in hours — what the audit reports. */
export function topicalityHalfLifeHours(value: number | null | undefined, heat: number): number {
  const strength = topicalityStrength(value);
  if (!(strength > 0) || !(heat > 0) || heat >= strength) return 0;
  return TOPICALITY_HALF_LIFE_HOURS * Math.log2(strength / heat);
}
