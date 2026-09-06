import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { clampAppeal } from "../appeal";
import { clampTopicality } from "../topicality";
import { CATEGORY_IDS } from "../categories";
import { loadMarketsContent, loadPeople, MarketContentSchema, type MarketContent } from "../content";
import { listMarkets } from "../markets";
import {
  RESOLUTION_RUN_VERSION,
  ResolutionEntrySchema,
  ResolutionRunSchema,
  fingerprintMarket,
  type ResolutionEntry,
  type ResolutionRun,
} from "../resolution";
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
  /** verdicts written to a resolution run for a human to research and approve — never settled here */
  proposedResolutions: string[];
  /** the run file those verdicts were written to, or null when there was nothing to write */
  resolutionRun: string | null;
  skippedResolutions: { slug: string; reason: string }[];
}

/**
 * Where a proposal run is written, matching `RUNS_DIR` in scripts/resolve.ts so
 * that `npm run resolve -- report/approve` picks the file up like any other run.
 */
const RUNS_DIR = "data/resolutions";

/**
 * The model's own certainty, on the 0–1 scale the run file speaks.
 *
 * Anything below LOW_CONFIDENCE (0.75) makes the report tell the human to read
 * the evidence before approving, which is why "high" lands just above it and the
 * other two land well below: the generator has web search and no verification
 * step, so its confidence is a lead, not a finding.
 */
const CONFIDENCE: Record<"high" | "medium" | "low", number> = { high: 0.8, medium: 0.5, low: 0.25 };

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
    proposedResolutions: [],
    resolutionRun: null,
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

  /*
   * A verdict this model returns is a lead, not a resolution, and it leaves here
   * as a proposal in exactly the shape `npm run resolve -- propose` writes.
   *
   * It used to leave as a MarketContent with `status: "resolved"` and ride into
   * `upsertMarkets` beside the new questions, which called `settleMarket` and
   * credited every position on the board — no human, no evidence anyone had
   * opened, and no way back, since nothing on the site un-settles a market. That
   * contradicted the one rule AGENT.md states twice ("אף הכרעה לא מתפרסמת בלי
   * אישור מפורש"), and the asymmetry it broke is the whole reason the two
   * routines are separate: adding a question can be undone by cancelling it and
   * refunding everyone, and settling cannot be undone at all.
   *
   * So the run file is where this stops. The entries land unapproved and, for
   * YES, blocked — `checkEntry` refuses a YES with no evidence, and evidence
   * means a quote copied off a page someone opened, which is precisely the work
   * this step has not done. The URL the model named travels in the note instead,
   * labelled as unverified, so the human researching the run has somewhere to
   * start rather than something to rubber-stamp.
   */
  const contentBySlug = new Map(loadMarketsContent().markets.map((m) => [m.slug, m]));
  const toPropose: ResolutionEntry[] = [];
  for (const r of out.resolutions) {
    const m = existing.find((x) => x.id === r.slug);
    if (!m || m.status !== "open") {
      result.skippedResolutions.push({ slug: r.slug, reason: "unknown or already resolved" });
      continue;
    }
    // The snapshot and the fingerprint come from data/markets.json when the question
    // is in it, because that is the file `apply` will compare against later: a
    // fingerprint taken off the database row would differ over nothing more than how
    // the same instant is spelled, and `apply` would read that as "the question
    // changed" and refuse an approval that was perfectly good.
    const snapshot: Pick<
      MarketContent,
      "slug" | "title" | "subtitle" | "resolutionCriteria" | "category" | "closesAt" | "initialProbability" | "sources" | "status"
    > = contentBySlug.get(m.id) ?? {
      slug: m.id,
      title: m.title,
      subtitle: m.subtitle ?? undefined,
      resolutionCriteria: m.resolutionCriteria,
      category: m.category as MarketContent["category"],
      closesAt: m.closesAt.toISOString(),
      initialProbability: m.probability,
      sources: m.sources,
      status: "open",
    };
    toPropose.push(
      ResolutionEntrySchema.parse({
        slug: m.id,
        market: {
          title: snapshot.title,
          subtitle: snapshot.subtitle,
          resolutionCriteria: snapshot.resolutionCriteria,
          category: snapshot.category,
          closesAt: snapshot.closesAt,
          initialProbability: snapshot.initialProbability,
          sources: snapshot.sources,
        },
        fingerprint: fingerprintMarket(snapshot),
        verdict: r.resolution,
        confidence: CONFIDENCE[r.confidence],
        note: `${r.resolutionNote}\n\nמקור שהמודל ציין ושטרם אומת: ${r.sourceUrl}`,
        // deliberately empty: the model did not open the page, and a quote it wrote
        // itself would be a fabricated quote wearing the word "ראיה"
        evidence: [],
        researchedAt: now.toISOString(),
      }),
    );
  }

  if (toPropose.length && !opts.dryRun) {
    const runId = now.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
    const run: ResolutionRun = ResolutionRunSchema.parse({
      version: RESOLUTION_RUN_VERSION,
      runId,
      createdAt: now.toISOString(),
      createdBy: `editorial-${source}`,
      note: "הצעות הכרעה של המחולל השעתי. אף אחת מהן לא נבדקה מול מקור — חקרו, מלאו evidence ו-searchedFor, ורק אז report/approve.",
      entries: toPropose,
    });
    const file = path.join(process.cwd(), RUNS_DIR, `${runId}.json`);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(run, null, 2) + "\n");
      result.resolutionRun = file;
      result.proposedResolutions = toPropose.map((e) => e.slug);
    } catch (err) {
      // A serverless filesystem is read-only, and a run that cannot be written is not
      // a run that failed: the questions above are the job, and a lost lead costs a
      // search next time. It is loud in the log and visible in the response, and it
      // still never reaches upsertMarkets.
      const reason = `resolution run not written: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[agent] ${reason}`);
      for (const e of toPropose) result.skippedResolutions.push({ slug: e.slug, reason });
    }
  } else if (toPropose.length) {
    result.proposedResolutions = toPropose.map((e) => e.slug);
  }

  if (!opts.dryRun) {
    // Only the new questions. Nothing this function builds is ever handed to
    // upsertMarkets with a resolved or cancelled status — and ../sync would refuse it
    // anyway, since `editorial-*` is not a source that may settle (see maySettle).
    const sync = await upsertMarkets(toInsert, `editorial-${source}`);
    result.added = sync.added;
    await logAgentRun(
      `editorial-${source}`,
      `${out.briefingSummary}`.slice(0, 1900),
      { added: sync.added, updated: [], resolved: [], ok: true },
    );
  } else {
    result.added = toInsert.map((m) => m.slug);
  }
  return result;
}
