import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { clampAppeal } from "../appeal";
import { clampTopicality } from "../topicality";
import { CATEGORY_IDS } from "../categories";
import { loadPeople, MarketContentSchema, type MarketContent } from "../content";
import { listMarkets } from "../markets";
import { duplicateRisk, REASON_TEXT, type Comparable } from "../similarity";
import { logAgentRun, upsertMarkets } from "../sync";
import { EDITORIAL_GUIDE, RESEARCH_INSTRUCTIONS } from "./prompt";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const MAX_SEARCHES = Number(process.env.AGENT_MAX_SEARCHES ?? 8);

const ProposalSchema = z.object({
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  description: z.string(),
  resolutionCriteria: z.string(),
  category: z.enum(CATEGORY_IDS),
  tags: z.array(z.string()),
  people: z.array(z.string()),
  closesAt: z.string(),
  initialProbability: z.number(),
  /** how good a question the editor thinks this is, 1..5 (see ../appeal) */
  appeal: z.number(),
  /** how tied to the news of the hour it is, 1..5 (see ../topicality) */
  topicality: z.number(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  /** short justification of why this is timely (not shown to users) */
  whyNow: z.string(),
});

const ResolutionSchema = z.object({
  slug: z.string(),
  resolution: z.enum(["YES", "NO", "CANCELLED"]),
  resolutionNote: z.string(),
  sourceUrl: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const OutputSchema = z.object({
  briefingSummary: z.string(),
  newMarkets: z.array(ProposalSchema),
  resolutions: z.array(ResolutionSchema),
});

export interface GeneratorResult {
  model: string;
  briefing: string;
  proposed: number;
  added: string[];
  rejected: { slug: string; reason: string }[];
  resolved: string[];
  skippedResolutions: { slug: string; reason: string }[];
}

/** A stored market in the shape the duplicate check reads (../similarity). */
function comparable(m: { id: string; title: string; resolutionCriteria: string; closesAt: Date; sources: { url: string }[] }): Comparable {
  return {
    slug: m.id,
    title: m.title,
    resolutionCriteria: m.resolutionCriteria,
    closesAt: m.closesAt.toISOString(),
    sources: m.sources,
  };
}

async function research(client: Anthropic, existingTitles: string[]): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${RESEARCH_INSTRUCTIONS}\n\nהיום: ${new Date().toISOString()}.\nשאלות שכבר קיימות באתר (אל תחזור עליהן, אבל כן חפש אם הוכרעו):\n${existingTitles.map((t) => `- ${t}`).join("\n")}`,
    },
  ];
  const tools: Anthropic.MessageCreateParams["tools"] = [
    { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES },
  ];
  let text = "";
  for (let i = 0; i < 6; i++) {
    const response = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        system: EDITORIAL_GUIDE,
        tools,
        messages,
      })
      .finalMessage();
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "refusal") {
      throw new Error("research refused by model safety system");
    }
    break;
  }
  return text.trim();
}

export async function runQuestionGenerator(opts: { source?: string; dryRun?: boolean } = {}): Promise<GeneratorResult> {
  const client = new Anthropic();
  const source = opts.source ?? "cron";
  const existing = await listMarkets({ status: "all", limit: 1000 });
  const existingOpen = existing.filter((m) => m.status === "open");
  const people = [...loadPeople().values()];

  const briefing = await research(
    client,
    existingOpen.map((m) => m.title),
  );

  const parsed = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: EDITORIAL_GUIDE,
    messages: [
      {
        role: "user",
        content: [
          `היום: ${new Date().toISOString()}.`,
          `אנשים זמינים (id — שם — תפקיד):\n${people.map((p) => `${p.id} — ${p.name}${p.role ? ` — ${p.role}` : ""}`).join("\n")}`,
          `שווקים פתוחים כרגע (slug | כותרת | נסגר):\n${existingOpen.map((m) => `${m.id} | ${m.title} | ${m.closesAt.toISOString()}`).join("\n")}`,
          `תדריך החדשות:\n${briefing}`,
          `על בסיס התדריך, הצע 3–6 שאלות חדשות (רק אם הן באמת חדשות ועומדות בכללים), והכרעות לשווקים קיימים שהוכרעו במציאות. אל תציע שאלה שדומה לשאלה קיימת. זכור את כלל התמהיל: לפחות שליש מהשאלות חייבות להיסגר תוך 24–72 שעות.`,
        ].join("\n\n"),
      },
    ],
    output_config: { format: zodOutputFormat(OutputSchema) },
  });

  const out = parsed.parsed_output;
  if (!out) throw new Error("model returned no structured output");

  const result: GeneratorResult = {
    model: MODEL,
    briefing: out.briefingSummary,
    proposed: out.newMarkets.length,
    added: [],
    rejected: [],
    resolved: [],
    skippedResolutions: [],
  };

  const now = new Date();
  const toInsert: MarketContent[] = [];
  /** what this run has already taken, so it cannot propose the same question twice */
  const accepted: Comparable[] = [];
  const peopleIds = new Set(people.map((p) => p.id));
  for (const p of out.newMarkets) {
    const bySlug = existing.find((m) => m.id === p.slug);
    if (bySlug) {
      result.rejected.push({ slug: p.slug, reason: `duplicate of ${bySlug.id}` });
      continue;
    }
    const proposed: Comparable = {
      slug: p.slug,
      title: p.title,
      resolutionCriteria: p.resolutionCriteria,
      closesAt: p.closesAt,
      sources: p.sources,
    };
    // The check this path used to carry was its own — raw word overlap at 0.6,
    // no stemming, no scaffolding removed — on a board where every title is
    // built from "האם … יפרסם … סקר … מנדטים … עד". It now shares one definition
    // of "the same question" with scripts/merge-markets.ts. Nobody reads this
    // run before it publishes, so both levels are refused: the writer who would
    // justify a "review" pair in a batch does not exist on the cron path.
    //
    // Only against what is still open — a question the board already settled is
    // history, and asking it again about a new window is a legitimate question —
    // plus the proposals this same run already accepted, which is how one run
    // writes the same story twice.
    const dup = [...existingOpen.map(comparable), ...accepted]
      .map((m) => ({ m, risk: duplicateRisk(proposed, m) }))
      .find(({ risk }) => risk.level !== "clear");
    if (dup) {
      result.rejected.push({
        slug: p.slug,
        reason: `duplicate of ${dup.m.slug} — ${dup.risk.reasons.map((r) => REASON_TEXT[r]).join("; ")}`,
      });
      continue;
    }
    const candidate = MarketContentSchema.safeParse({
      ...p,
      subtitle: p.subtitle ?? undefined,
      people: p.people.filter((id) => peopleIds.has(id)),
      liquidity: 2000,
      appeal: clampAppeal(p.appeal),
      // the generator runs on the hour off a fresh web search, so its questions are
      // exactly the ones this rating exists for — and it is stamped now, so the decay
      // starts now
      topicality: clampTopicality(p.topicality),
      featured: false,
      status: "open",
      createdAt: now.toISOString(),
      createdBy: `editorial-${source}`,
    });
    if (!candidate.success) {
      result.rejected.push({ slug: p.slug, reason: candidate.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      continue;
    }
    const closes = new Date(candidate.data.closesAt).getTime();
    if (closes < now.getTime() + 2 * 3600_000 || closes > now.getTime() + 120 * 86_400_000) {
      result.rejected.push({ slug: p.slug, reason: "closesAt out of range" });
      continue;
    }
    toInsert.push(candidate.data);
    accepted.push(candidate.data);
  }

  const toResolve: MarketContent[] = [];
  for (const r of out.resolutions) {
    const m = existing.find((x) => x.id === r.slug);
    if (!m || m.status !== "open") {
      result.skippedResolutions.push({ slug: r.slug, reason: "unknown or already resolved" });
      continue;
    }
    if (r.confidence !== "high") {
      result.skippedResolutions.push({ slug: r.slug, reason: `confidence ${r.confidence}` });
      continue;
    }
    toResolve.push({
      slug: m.id,
      title: m.title,
      subtitle: m.subtitle ?? undefined,
      description: m.description,
      resolutionCriteria: m.resolutionCriteria,
      category: m.category as MarketContent["category"],
      tags: m.tags,
      people: m.people,
      imageUrl: m.imageUrl ?? undefined,
      closesAt: m.closesAt.toISOString(),
      initialProbability: m.probability,
      liquidity: m.liquidity,
      appeal: m.appeal,
      topicality: m.topicality,
      featured: m.featured,
      status: r.resolution === "CANCELLED" ? "cancelled" : "resolved",
      resolution: r.resolution === "CANCELLED" ? undefined : r.resolution,
      resolutionNote: `${r.resolutionNote}\nמקור: ${r.sourceUrl}`,
      resolvedAt: now.toISOString(),
      sources: m.sources,
      createdAt: m.createdAt.toISOString(),
      createdBy: m.createdBy,
    });
  }

  if (!opts.dryRun) {
    const sync = await upsertMarkets([...toInsert, ...toResolve], `editorial-${source}`);
    result.added = sync.added;
    result.resolved = sync.resolved;
    await logAgentRun(
      `editorial-${source}`,
      `${out.briefingSummary}`.slice(0, 1900),
      { added: sync.added, updated: [], resolved: sync.resolved, ok: true },
    );
  } else {
    result.added = toInsert.map((m) => m.slug);
    result.resolved = toResolve.map((m) => m.slug);
  }
  return result;
}
