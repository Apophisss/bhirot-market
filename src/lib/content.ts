import { z } from "zod";
import { APPEAL_DEFAULT, APPEAL_MAX, APPEAL_MIN } from "./appeal";
import { TOPICALITY_DEFAULT, TOPICALITY_MAX, TOPICALITY_MIN } from "./topicality";
import { CATEGORY_IDS } from "./categories";
import marketsJson from "../../data/markets.json";
import peopleJson from "../../data/people.json";

/**
 * Emoji and pictographs stay out of every string the site renders, so a
 * generated question can't put one back on the board. Currency, dashes and
 * math signs are deliberately not matched.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{231A}\u{231B}\u{23E9}-\u{23FF}]/u;

/** Exported so a pipeline can fail on an emoji before the schema does (see ./resolution). */
export const hasEmoji = (v: string) => EMOJI.test(v);

function noEmoji<T extends z.ZodType<string>>(schema: T) {
  return schema.refine((v) => !hasEmoji(v), "must not contain emoji");
}

export const SourceSchema = z.object({
  title: noEmoji(z.string().min(1).max(200)),
  url: z.string().url(),
});

/**
 * The one title length the site actually has.
 *
 * Three numbers were documented at once — 80 in AGENT.md, 120 in the audit, 180
 * in this schema — and none of them was the number that matters: the landing
 * hero and the rapid card cut a title at 95 characters, silently, so 45 of the
 * questions on the board are published with their deadline chopped off. This is
 * that number, and everything else quotes it.
 *
 * The stored schema still accepts the long titles already in data/markets.json
 * (see `MarketContentSchema` below) — retroactively invalidating the file would
 * only break `markets:validate` for questions nobody can rewrite now. The limit
 * is enforced where a title can still be changed: on the way in, at merge.
 */
export const TITLE_LIMIT = 95;

/** Under this, the rapid card is the whole question: title and subtitle, nothing else. */
export const SUBTITLE_REQUIRED_DAYS = 7;

/**
 * The opening-probability band a normal question has to sit in.
 *
 * Outside it there is nothing to answer: at 4% or 97% the question is a fact
 * with a deadline. The exception is the long-horizon "big board" — "האם נתניהו
 * יעמוד בראש הממשלה הבאה" is allowed to open anywhere, because months of news
 * still have to happen before it resolves.
 */
export const OPENING_BAND = { min: 0.15, max: 0.85 } as const;
/** A question closing this far out is a big-board question, and prices outside the band are fine there. */
export const BIG_BOARD_DAYS = 30;

/**
 * Question shapes that experience says cannot be resolved cleanly.
 *
 * Every one of these is on the list because a question written that way came
 * back to the resolution routine with no public page that decides it — and the
 * only ways out are cancelling a question people answered, or ruling on a
 * judgement call. They are warnings and not errors: an archetype can be rescued
 * by resolutionCriteria that name the outlet, the page and the moment.
 */
const ARCHETYPES: { test: RegExp; unless?: RegExp; why: string }[] = [
  {
    // "ידווח כי" makes the *reporting* the event: it resolves on whether some
    // outlet chose a wording, which no page states and two readers read
    // differently. "האם יפורסם סקר…" is the same verb and the opposite
    // question — a poll, an announcement or a report is a document that either
    // exists or does not, so a named artefact takes the question off the list.
    test: /האם\s+(?:ידווח|ידווחו|יפורסם|יתפרסם|תפורסם)|ידווח(?:ו)?\s+כי/,
    unless: /סקר|הודעה|דוח|נתונים|פרוטוקול|החלטה|רשימה|כתב\s+אישום|מכתב/,
    why: 'ארכיטיפ "ידווח כי…" — ההכרעה תלויה בניסוח של כתבה ולא באירוע עצמו',
  },
  {
    // "will he respond / react / clarify" has no page that says he did not.
    // No \b anywhere in this file: JavaScript's word boundary is defined on
    // [A-Za-z0-9_], so \b never matches beside a Hebrew letter and a pattern
    // wearing one silently matches nothing.
    test: /(?:יתייחס|תתייחס|יתייחסו|יגיב|תגיב|יגיבו|יבהיר|תבהיר|יבהירו)/,
    why: 'ארכיטיפ "יתייחס/יגיב/יבהיר" — אין עמוד פומבי שקובע שלא הייתה התייחסות',
  },
  {
    // an unnamed subject: whoever resolves it gets to choose who counts.
    test: /מפלגה\s+נוספת|רשימה\s+נוספת|(?:^|\s)גורם(?:ים)?\s|(?:^|\s)בכיר(?:ים)?\s|גורם\s+מדיני|מקורב(?:ים)?\s/,
    why: 'נושא מעורפל ("מפלגה נוספת", "גורם", "בכיר") — מי בדיוק נחשב נקבע רק בהכרעה',
  },
  {
    // the state of a live page at an instant: the page is rewritten, and the
    // archive rarely holds the minute the question asked about.
    test: /(?:באתר|בדף|בעמוד|ברשימה\s+באתר)[^,.?]{0,40}(?:בשעה|נכון\s+ל)|נכון\s+לשעה|כפי\s+שמופיע/,
    why: "הכרעה לפי מצב של דף אינטרנט ברגע נתון — הדף משתנה ואין ארכיון לרגע הזה",
  },
  {
    // something that happens most days is a question about the calendar, not
    // about the news — unless it carries a threshold that makes it rare.
    test: /(?:יצייץ|יפרסם\s+פוסט|יעלה\s+סרטון|יתקיים\s+דיון|יאמר|יצהיר\s+כי|יופיע\s+בתקשורת)/,
    unless: /לפחות|מעל|יותר\s+מ|פעמיים|שלוש|לכל\s+הפחות|\d+\s*%/,
    why: "אירוע כמעט-יומי בלי סף נדירות — הוסיפו מספר, ערוץ או תנאי שהופך אותו לא-טריוויאלי",
  },
];

/**
 * The archetype warnings a question earns, in the language the pipeline reports in.
 * Empty for a question shaped so that a public page can decide it.
 */
export function archetypeWarnings(m: { title: string }): string[] {
  return ARCHETYPES.filter((a) => a.test.test(m.title) && !a.unless?.test(m.title)).map((a) => a.why);
}

const MarketContentFields = z.object({
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case ascii"),
  title: noEmoji(z.string().min(10).max(180)),
  subtitle: noEmoji(z.string().max(240)).optional(),
  description: noEmoji(z.string().min(20).max(4000)),
  resolutionCriteria: noEmoji(z.string().min(20).max(4000)),
  category: z.enum(CATEGORY_IDS),
  tags: z.array(noEmoji(z.string().min(1).max(40))).max(12).default([]),
  /** ids from data/people.json — first one supplies the card photo */
  people: z.array(z.string()).max(6).default([]),
  /** explicit image override (absolute URL or /public path) */
  imageUrl: z.string().optional(),
  closesAt: z.string().datetime({ offset: true }),
  initialProbability: z.number().min(0.02).max(0.98),
  liquidity: z.number().min(200).max(100000).default(2000),
  /** the creator's own verdict on how good a question this is, 1..5 — see ./appeal */
  appeal: z.number().int().min(APPEAL_MIN).max(APPEAL_MAX).default(APPEAL_DEFAULT),
  /**
   * how tied to today's news this question is, 1..5, read together with `createdAt`
   * and decaying from it — see ./topicality. 1 (the default) is an evergreen question.
   */
  topicality: z.number().int().min(TOPICALITY_MIN).max(TOPICALITY_MAX).default(TOPICALITY_DEFAULT),
  featured: z.boolean().default(false),
  status: z.enum(["open", "resolved", "cancelled"]).default("open"),
  resolution: z.enum(["YES", "NO"]).optional(),
  resolutionNote: noEmoji(z.string().max(2000)).optional(),
  resolvedAt: z.string().datetime({ offset: true }).optional(),
  sources: z.array(SourceSchema).max(12).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.string().default("seed"),
});

/** A resolved question without its evidence is the one shape the file may never hold. */
function requireResolutionEvidence(m: z.infer<typeof MarketContentFields>, ctx: z.RefinementCtx) {
  if (m.status === "resolved" && !m.resolution) {
    ctx.addIssue({ code: "custom", message: "resolved markets need a resolution", path: ["resolution"] });
  }
  if (m.status === "resolved" && !m.resolutionNote) {
    ctx.addIssue({ code: "custom", message: "resolved markets need a resolutionNote with the evidence", path: ["resolutionNote"] });
  }
}

export const MarketContentSchema = MarketContentFields.superRefine(requireResolutionEvidence);

export type MarketContent = z.infer<typeof MarketContentSchema>;

/**
 * The same question, checked the way a *new* one is checked (scripts/merge-markets.ts).
 *
 * Everything here is a rule the board learned the hard way and can only apply on
 * the way in: a title the hero will not cut, a subtitle on the questions whose
 * card shows nothing else, and an opening price that leaves something to answer.
 * The stored file is deliberately not held to them — 45 of its titles are over
 * the limit and re-writing a question that people already answered changes what
 * they answered.
 */
export const NewMarketContentSchema = MarketContentFields.superRefine(requireResolutionEvidence).superRefine((m, ctx) => {
  if (m.title.length > TITLE_LIMIT) {
    ctx.addIssue({
      code: "custom",
      message: `title is ${m.title.length} chars — over the ${TITLE_LIMIT} the hero and the rapid card cut at; move the detail into subtitle/resolutionCriteria`,
      path: ["title"],
    });
  }
  const daysOut = (new Date(m.closesAt).getTime() - Date.now()) / 86_400_000;
  if (Number.isFinite(daysOut) && daysOut <= SUBTITLE_REQUIRED_DAYS && !m.subtitle?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: `closes in ${Math.max(0, Math.round(daysOut))}d and has no subtitle — the rapid card shows the title and the subtitle and nothing else`,
      path: ["subtitle"],
    });
  }
  const bigBoard = Number.isFinite(daysOut) && daysOut > BIG_BOARD_DAYS;
  if (!bigBoard && (m.initialProbability < OPENING_BAND.min || m.initialProbability > OPENING_BAND.max)) {
    ctx.addIssue({
      code: "custom",
      message:
        `opens at ${Math.round(m.initialProbability * 100)}% — outside the ${OPENING_BAND.min * 100}–${OPENING_BAND.max * 100}% band. ` +
        `Only a question closing more than ${BIG_BOARD_DAYS} days out may price outside it`,
      path: ["initialProbability"],
    });
  }
});

export const MarketsFileSchema = z.object({
  version: z.number().int().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  /** free-text note by whoever last updated (usually the hourly editorial routine) */
  lastUpdateNote: noEmoji(z.string().max(2000)).optional(),
  markets: z.array(MarketContentSchema),
}).superRefine((file, ctx) => {
  const seen = new Set<string>();
  file.markets.forEach((m, i) => {
    if (seen.has(m.slug)) {
      ctx.addIssue({ code: "custom", message: `duplicate slug ${m.slug}`, path: ["markets", i, "slug"] });
    }
    seen.add(m.slug);
  });
});

export type MarketsFile = z.infer<typeof MarketsFileSchema>;

export const PersonSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  role: z.string().optional(),
  /** English Wikipedia article title, used to fetch the photo */
  wiki: z.string().optional(),
  /** local path under /public (photos are vendored so the site never hotlinks Wikimedia) */
  image: z.string().optional(),
  /** original Wikimedia URL the local copy came from */
  imageSource: z.string().url().optional(),
  imageCredit: z.string().optional(),
});
export type Person = z.infer<typeof PersonSchema>;
export const PeopleFileSchema = z.object({ people: z.array(PersonSchema) });

export function loadMarketsContent(): MarketsFile {
  return MarketsFileSchema.parse(marketsJson);
}

let peopleCache: Map<string, Person> | null = null;
export function loadPeople(): Map<string, Person> {
  if (!peopleCache) {
    const parsed = PeopleFileSchema.parse(peopleJson);
    peopleCache = new Map(parsed.people.map((p) => [p.id, p]));
  }
  return peopleCache;
}

export function getPerson(id: string): Person | undefined {
  return loadPeople().get(id);
}
