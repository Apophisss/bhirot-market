import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isAdminRequest } from "@/lib/admin";
import { unauthorized } from "@/lib/api-auth";
import { CATEGORY_IDS } from "@/lib/categories";
import { MarketContentSchema, type MarketContent } from "@/lib/content";
import { getDb, schema } from "@/lib/db";
import { israelLocalToIso } from "@/lib/il-time";
import { markSuggestionPublished } from "@/lib/inbox";
import { suggestSlug } from "@/lib/slug";
import { logAgentRun, upsertMarkets } from "@/lib/sync";

export const dynamic = "force-dynamic";

/**
 * What the dashboard form sends. It is deliberately not MarketContent: the form
 * speaks in percent and in Israel wall-clock time, and lets the slug and the
 * timestamps be filled in here.
 */
const Body = z.object({
  slug: z.string().trim().max(80).optional(),
  title: z.string().trim().min(10).max(180),
  subtitle: z.string().trim().max(240).optional(),
  description: z.string().trim().min(20).max(4000),
  resolutionCriteria: z.string().trim().min(20).max(4000),
  category: z.enum(CATEGORY_IDS),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  people: z.array(z.string().trim()).max(6).default([]),
  imageUrl: z.string().trim().max(500).optional(),
  /** "2026-09-20T20:59" in Israel time, or a full ISO string */
  closesAt: z.string().trim().min(4),
  /** the opening YES price, in percent */
  probabilityPct: z.number().min(2).max(98),
  liquidity: z.number().min(200).max(100_000).default(2000),
  featured: z.boolean().default(false),
  sources: z.array(z.object({ title: z.string().trim().min(1).max(200), url: z.string().trim().url() })).max(12).default([]),
  /** the suggestion this question came from, if it was published out of the inbox */
  fromSuggestion: z.number().int().positive().optional(),
});

/** Publish a new question straight to the board. Auth: admin session or ADMIN_TOKEN. */
export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized("צריך הרשאת ניהול");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "טופס לא תקין", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const closesAt = israelLocalToIso(input.closesAt);
  if (!closesAt) return NextResponse.json({ ok: false, error: "מועד סגירה לא תקין" }, { status: 400 });
  if (new Date(closesAt).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "מועד הסגירה חייב להיות בעתיד" }, { status: 400 });
  }

  const slug = (input.slug?.trim() || suggestSlug(input.title)).toLowerCase();
  const now = new Date().toISOString();
  const candidate = {
    slug,
    title: input.title,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
    description: input.description,
    resolutionCriteria: input.resolutionCriteria,
    category: input.category,
    tags: input.tags,
    people: input.people,
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    closesAt,
    initialProbability: Math.round(input.probabilityPct) / 100,
    liquidity: input.liquidity,
    featured: input.featured,
    status: "open" as const,
    sources: input.sources,
    createdAt: now,
    createdBy: "admin",
  };

  const content = MarketContentSchema.safeParse(candidate);
  if (!content.success) {
    return NextResponse.json(
      { ok: false, error: content.error.issues[0]?.message ?? "השאלה לא עברה ולידציה", issues: content.error.issues },
      { status: 400 },
    );
  }

  const db = await getDb();
  const existing = await db.query.markets.findFirst({ where: eq(schema.markets.id, slug) });
  if (existing) {
    return NextResponse.json({ ok: false, error: `כבר קיים שוק עם המזהה ${slug}` }, { status: 409 });
  }

  const result = await upsertMarkets([content.data as MarketContent], "admin");
  await logAgentRun("admin", `שאלה חדשה מלוח הניהול: ${input.title}`, result);
  if (input.fromSuggestion) await markSuggestionPublished(input.fromSuggestion, slug);

  return NextResponse.json({ ok: true, slug, market: content.data, result });
}
