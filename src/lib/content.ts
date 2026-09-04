import { z } from "zod";
import { CATEGORY_IDS } from "./categories";
import marketsJson from "../../data/markets.json";
import peopleJson from "../../data/people.json";

/**
 * Emoji and pictographs stay out of every string the site renders, so a
 * generated question can't put one back on the board. Currency, dashes and
 * math signs are deliberately not matched.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{231A}\u{231B}\u{23E9}-\u{23FF}]/u;

function noEmoji<T extends z.ZodType<string>>(schema: T) {
  return schema.refine((v) => !EMOJI.test(v), "must not contain emoji");
}

export const SourceSchema = z.object({
  title: noEmoji(z.string().min(1).max(200)),
  url: z.string().url(),
});

export const MarketContentSchema = z.object({
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
  featured: z.boolean().default(false),
  status: z.enum(["open", "resolved", "cancelled"]).default("open"),
  resolution: z.enum(["YES", "NO"]).optional(),
  resolutionNote: noEmoji(z.string().max(2000)).optional(),
  resolvedAt: z.string().datetime({ offset: true }).optional(),
  sources: z.array(SourceSchema).max(12).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  createdBy: z.string().default("seed"),
}).superRefine((m, ctx) => {
  if (m.status === "resolved" && !m.resolution) {
    ctx.addIssue({ code: "custom", message: "resolved markets need a resolution", path: ["resolution"] });
  }
  if (m.status === "resolved" && !m.resolutionNote) {
    ctx.addIssue({ code: "custom", message: "resolved markets need a resolutionNote with the evidence", path: ["resolutionNote"] });
  }
});

export type MarketContent = z.infer<typeof MarketContentSchema>;

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
