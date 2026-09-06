/**
 * Bet-result verification — the pipeline that turns "the deadline passed" into
 * "the board says YES, and here is why".
 *
 * A resolution moves virtual money between users, so it is never a single
 * judgement call written straight into data/markets.json. It is a *run*: a file
 * under data/resolutions/ that carries, per market, what the question asked,
 * what the agent found, which public page proves it, who approved it, and what
 * the server answered when it was published. Every step is a state transition
 * on that file, and every transition has a gate:
 *
 *   propose  → the markets whose closesAt has passed, with empty verdicts
 *   research → the agent fills verdict + evidence (this file's `checkEntry`
 *              decides whether that is good enough to show a human)
 *   report   → the human reads it
 *   approve  → the human's decision, with their name and the time, per market
 *   apply    → approved entries are written into data/markets.json
 *   publish  → the same entries are POSTed to the live site
 *
 * The rules that matter live here, as pure functions over plain data, so they
 * are testable without a database, a network or a clock: scripts/resolve.ts is
 * only the CLI around them, and scripts/test-resolution.ts pins them down.
 */
import { z } from "zod";
import { hasEmoji, type MarketContent } from "./content";

/** CANCELLED refunds every position; YES/NO pay out. See settleMarket in ./trade. */
export const VERDICTS = ["YES", "NO", "CANCELLED"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The site's own schema caps resolutionNote here, so the composed note has to fit. */
export const MAX_NOTE = 2000;
/** A verdict written in fewer characters than this has not explained itself. */
export const MIN_NOTE = 40;
/** Below this the report asks the human to look closely rather than skim. */
export const LOW_CONFIDENCE = 0.75;

/**
 * Fine as background, never as the page a resolution rests on: they get edited
 * without a trace, they disappear, and they are not what the question promised.
 * Mirrors the weak-source list in scripts/audit-markets.ts.
 */
export const WEAK_EVIDENCE_HOSTS = new Set([
  "he.wikipedia.org",
  "en.wikipedia.org",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "t.me",
  "tiktok.com",
]);

const iso = z.string().datetime({ offset: true });

/**
 * One public page that decides the question. The quote is copied from it, not
 * summarised: a future run that re-opens the URL has to be able to see the same
 * words, and a human reading the report has to be able to judge without
 * clicking through.
 */
export const EvidenceSchema = z.object({
  title: z.string().min(3).max(200),
  url: z.string().url(),
  quote: z.string().min(10).max(600),
  checkedAt: iso,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** What the question said at propose time — the report reads this, not the live file. */
export const MarketSnapshotSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  resolutionCriteria: z.string(),
  category: z.string(),
  closesAt: iso,
  initialProbability: z.number(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
});

/** Optional live numbers from the server, so the report can show what is at stake. */
export const LiveSnapshotSchema = z.object({
  probability: z.number(),
  volume: z.number(),
  tradeCount: z.number(),
  fetchedAt: iso,
});

export const ApprovalSchema = z.object({
  decision: z.enum(["pending", "approved", "rejected"]).default("pending"),
  /** who approved — a person, never the agent */
  by: z.string().max(80).optional(),
  at: iso.optional(),
  reason: z.string().max(600).optional(),
  /**
   * fingerprintProposal() of the verdict, note and evidence at the moment of
   * approval. What was approved is what gets published: editing the verdict
   * afterwards invalidates the approval instead of riding on it.
   */
  proposalFingerprint: z.string().optional(),
});

export const ResolutionEntrySchema = z.object({
  slug: z.string(),
  market: MarketSnapshotSchema,
  /** detects the question changing between propose and apply */
  fingerprint: z.string(),
  live: LiveSnapshotSchema.optional(),
  verdict: z.enum(VERDICTS).nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
  /** the Hebrew resolutionNote the board will show, before the source lines */
  note: z.string().default(""),
  evidence: z.array(EvidenceSchema).default([]),
  /** the searches actually run — the record that "nothing happened" was looked for */
  searchedFor: z.array(z.string().max(200)).default([]),
  researchedAt: iso.optional(),
  /** resolving before closesAt (a duplicate, an impossible question) needs a stated reason */
  early: z.object({ reason: z.string().min(10).max(600) }).optional(),
  approval: ApprovalSchema.default({ decision: "pending" }),
  applied: z.object({ at: iso }).optional(),
  published: z
    .object({
      at: iso,
      target: z.string(),
      result: z.enum(["resolved", "skipped", "failed"]),
      detail: z.string().max(600).optional(),
    })
    .optional(),
});
export type ResolutionEntry = z.infer<typeof ResolutionEntrySchema>;

export const RESOLUTION_RUN_VERSION = 1;

export const ResolutionRunSchema = z.object({
  version: z.literal(RESOLUTION_RUN_VERSION),
  runId: z.string(),
  createdAt: iso,
  createdBy: z.string().default("editorial-routine"),
  note: z.string().max(2000).optional(),
  entries: z.array(ResolutionEntrySchema).default([]),
  publish: z
    .object({ at: iso, target: z.string(), ok: z.boolean(), response: z.string().max(4000).optional() })
    .optional(),
});
export type ResolutionRun = z.infer<typeof ResolutionRunSchema>;

/* ---------------------------------------------------------------- helpers */

/** FNV-1a. Not a security boundary — a drift detector with no imports that behaves identically everywhere. */
function fnv1a(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const ch of input) {
    h = (h ^ BigInt(ch.codePointAt(0)!)) & mask;
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * Stable id for "the question as it was when it was proposed". If the title,
 * the criteria, the deadline or the status changed while the run waited for
 * approval, the human approved a different question than the one being
 * applied — and apply refuses.
 */
export function fingerprintMarket(
  m: Pick<MarketContent, "slug" | "title" | "resolutionCriteria" | "closesAt" | "status">,
): string {
  return fnv1a([m.slug, m.title, m.resolutionCriteria, m.closesAt, m.status].join("\n"));
}

/**
 * Stable id for "the answer as it was when it was approved" — the other half of
 * the same guarantee. The approval covers this exact verdict, note and set of
 * evidence; a later edit to any of them makes the approval stale instead of
 * riding onto the board on the strength of the old one.
 */
export function fingerprintProposal(
  entry: Pick<ResolutionEntry, "slug" | "verdict" | "note" | "evidence">,
): string {
  return fnv1a([entry.slug, entry.verdict ?? "", composeNote(entry), ...entry.evidence.map((e) => e.url)].join("\n"));
}

export const HOUR = 3_600_000;

export function hoursOverdue(m: Pick<MarketContent, "closesAt">, now: number): number {
  return (now - new Date(m.closesAt).getTime()) / HOUR;
}

/**
 * The markets a run is allowed to touch: open, and past their deadline.
 * `graceHours` holds back a market that closed minutes ago, where the deciding
 * report is usually not out yet. Most overdue first — the oldest debt is the
 * most visible bug on the board.
 */
export function dueMarkets(
  markets: MarketContent[],
  now: number,
  opts: { graceHours?: number; limit?: number } = {},
): MarketContent[] {
  const grace = opts.graceHours ?? 0;
  const due = markets
    .filter((m) => m.status === "open" && hoursOverdue(m, now) >= grace)
    .sort((a, b) => hoursOverdue(b, now) - hoursOverdue(a, now));
  return opts.limit ? due.slice(0, opts.limit) : due;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The note the board actually shows: the agent's Hebrew explanation, with the
 * evidence URLs appended when the text does not already carry them. AGENT.md
 * asks every resolutionNote to name its source; this makes that automatic
 * rather than something a run can forget.
 */
export function composeNote(entry: Pick<ResolutionEntry, "note" | "evidence">): string {
  const base = entry.note.trim();
  const missing = entry.evidence.map((e) => e.url).filter((url) => !base.includes(url));
  if (!missing.length) return base;
  return `${base}\n\nמקור: ${missing.join(" · ")}`;
}

/* ------------------------------------------------------------------ gates */

export interface Problem {
  level: "block" | "review";
  message: string;
}

/**
 * Is this proposal fit to put in front of a human, and then on the board?
 *
 * `block` problems stop approval outright — the CLI will not record an approval
 * for an entry that has one. `review` problems are judgement calls the report
 * shows the human, who may knowingly accept them.
 *
 * The asymmetry between the verdicts is deliberate:
 *  - YES needs a page that says the thing happened.
 *  - NO is usually a claim about an absence, which no page states. What stands
 *    in for evidence there is the dry run the question promised in gate 3 of
 *    the market-questions skill: the searches, recorded, that came back empty.
 *  - CANCELLED refunds everyone, so it needs a reason, not a source.
 */
export function checkEntry(entry: ResolutionEntry, now: number = Date.now()): Problem[] {
  const problems: Problem[] = [];
  const block = (message: string) => problems.push({ level: "block", message });
  const review = (message: string) => problems.push({ level: "review", message });

  if (!entry.verdict) {
    block("אין הכרעה — verdict חייב להיות YES, NO או CANCELLED");
    return problems;
  }

  const overdue = (now - new Date(entry.market.closesAt).getTime()) / HOUR;
  if (overdue < 0 && !entry.early) {
    block(`מועד הסגירה עוד לא עבר (עוד ${Math.abs(Math.round(overdue))} שעות) — הכרעה מוקדמת דורשת early.reason`);
  }

  const note = composeNote(entry);
  if (note.length < MIN_NOTE) {
    block(`ה-resolutionNote קצר מדי (${note.length} תווים, מינימום ${MIN_NOTE}) — זה ההסבר שהמשתמשים יראו`);
  }
  if (note.length > MAX_NOTE) block(`ה-resolutionNote ארוך מדי (${note.length} תווים, מקסימום ${MAX_NOTE})`);
  if (hasEmoji(note)) block("ה-resolutionNote מכיל אמוג'י — הסכמה של האתר חוסמת אותם");

  for (const e of entry.evidence) {
    if (!hostOf(e.url)) block(`ראיה עם URL לא תקין: ${e.url}`);
    else if (!e.url.startsWith("https://")) review(`ראיה שאינה https: ${e.url}`);
  }

  if (entry.verdict === "YES" || entry.verdict === "NO") {
    const weakOnly =
      entry.evidence.length > 0 &&
      entry.evidence.every((e) => {
        const host = hostOf(e.url);
        return !host || WEAK_EVIDENCE_HOSTS.has(host);
      });
    const hosts = entry.evidence.map((e) => hostOf(e.url) ?? e.url).join(", ");
    if (entry.verdict === "YES") {
      if (!entry.evidence.length) block("הכרעת YES בלי ראיה — צריך לפחות עמוד פומבי אחד שמראה שהאירוע קרה");
      else if (weakOnly) block(`הכרעת YES שנשענת רק על מקור חלש (${hosts}) — צריך דיווח או פרסום רשמי`);
    } else if (!entry.evidence.length) {
      // "it did not happen" — the searches that came back empty are the evidence
      if (entry.searchedFor.length < 2) {
        block("הכרעת NO בלי ראיה ובלי תיעוד חיפוש — רשמו ב-searchedFor לפחות שתי שאילתות שהורצו ולא החזירו כלום");
      } else {
        review("הכרעת NO נשענת על חיפוש שלא מצא כלום — ודאו שהחיפושים כיסו את מה שהשאלה הבטיחה");
      }
    } else if (weakOnly) {
      review(`הכרעת NO שנשענת רק על מקור חלש (${hosts})`);
    }
  }

  if (entry.verdict === "CANCELLED" && entry.note.trim().length < MIN_NOTE) {
    block("ביטול שוק מחזיר את כל הכסף — צריך הסבר מלא למה השאלה אינה ניתנת להכרעה");
  }

  if (entry.confidence === null) block("אין confidence — כמה בטוחים בהכרעה הזו (0–1)");
  else if (entry.confidence < LOW_CONFIDENCE) {
    review(`ביטחון ${Math.round(entry.confidence * 100)}% — מתחת ל-${Math.round(LOW_CONFIDENCE * 100)}%, קראו את הראיה לפני האישור`);
  }

  if (!entry.researchedAt) review("לא נרשם מתי המחקר נעשה");

  return problems;
}

export const blocking = (problems: Problem[]) => problems.filter((p) => p.level === "block");
export const isReady = (entry: ResolutionEntry, now?: number) => blocking(checkEntry(entry, now)).length === 0;

/**
 * An entry may be written to the board only after a named human said yes to
 * this exact proposal: a decision, a name, a time, and the fingerprint of what
 * they were shown.
 */
export function isApproved(entry: ResolutionEntry): boolean {
  const a = entry.approval;
  if (a.decision !== "approved" || !a.by || !a.at || !a.proposalFingerprint) return false;
  return a.proposalFingerprint === fingerprintProposal(entry);
}

/** Why isApproved() said no — the CLI turns this into the line the operator reads. */
export function approvalProblem(entry: ResolutionEntry): string | null {
  const a = entry.approval;
  if (a.decision === "rejected") return "נדחה באישור";
  if (a.decision !== "approved") return "ממתין לאישור";
  if (!a.by || !a.at) return "אישור בלי חתימה או בלי זמן";
  if (!a.proposalFingerprint) return "אישור בלי טביעת אצבע של ההצעה";
  if (a.proposalFingerprint !== fingerprintProposal(entry)) {
    return "ההצעה השתנתה אחרי האישור (הכרעה, נימוק או ראיות) — צריך אישור מחדש";
  }
  return null;
}

/* ------------------------------------------------------- the settlement gate */

/*
 * Everything above decides whether a resolution may be WRITTEN — into
 * data/markets.json, by `applyResolution`. The three functions below decide
 * whether one may be SETTLED — credited to people's balances, by `settleMarket`
 * through `upsertMarkets` in ../sync.
 *
 * They exist because those are two different doors into the same room. Every
 * caller of `upsertMarkets` hands it a plain `MarketContent`, and a MarketContent
 * that happens to say `"status": "resolved"` looks exactly the same whether a
 * human approved it or a model invented it thirty seconds ago — the approval,
 * the evidence and the fingerprint all live in the run file, which never travels
 * with the market. The hourly generator (../agent/generate.ts) used to walk
 * straight through that door.
 *
 * So the gate is on the one thing that does travel: who is asking. A payload may
 * settle only if it arrives from a path whose resolutions have already passed
 * `isApproved()` somewhere upstream, and there are exactly two of those.
 */

/**
 * `scripts/resolve.ts publish` stamps its POST with `resolve-<runId>`, and it
 * sends only entries that `isApproved()` returned true for and that `apply`
 * already wrote to the file. That prefix is therefore the signature of the
 * pipeline's own last step. Keep `publishSource()` and the CLI in step.
 */
export const PUBLISH_SOURCE_PREFIX = "resolve-";

/** The `source` the publish step sends; 40 chars is the API's own cap on the field. */
export function publishSource(runId: string): string {
  return `${PUBLISH_SOURCE_PREFIX}${runId}`.slice(0, 40);
}

/**
 * The other approved path: a sync of data/markets.json itself. The resolution
 * fields in that file can only have been written by `applyResolution()` above,
 * which refuses without `approvalProblem() === null` — so the human approval is
 * baked into the file before it ever reaches a database. `syncFromContent` in
 * ../sync is the only caller allowed to pass this, and it passes it explicitly
 * rather than by naming itself, so a new caller of it cannot acquire the right
 * by accident.
 */
export const CONTENT_SETTLEMENT_SOURCE = "markets-file";

/** May a payload arriving from `source` close a market and pay out on it? */
export function maySettle(source: string): boolean {
  return source === CONTENT_SETTLEMENT_SOURCE || source.startsWith(PUBLISH_SOURCE_PREFIX);
}

/**
 * The line the server logs when it refuses one — written for whoever reads it in
 * the deploy log at two in the morning, which is why it names the way out.
 */
export function settlementRefusal(source: string): string | null {
  if (maySettle(source)) return null;
  return `הכרעה שהגיעה מ-"${source}" לא בוצעה: רק אישור אדם מכריע. הריצו npm run resolve -- propose/report/approve/apply/publish`;
}

/* ------------------------------------------------------------------ apply */

export class ResolutionError extends Error {}

/**
 * The single place a market's outcome is written. Touches only the resolution
 * fields: initialProbability, liquidity, slug, closesAt and the wording of the
 * question stay exactly as they were, because changing any of them after the
 * fact rewrites what people traded on.
 */
export function applyResolution(market: MarketContent, entry: ResolutionEntry, at: Date): MarketContent {
  if (!entry.verdict) throw new ResolutionError(`${entry.slug}: אין הכרעה`);
  const approval = approvalProblem(entry);
  if (approval) throw new ResolutionError(`${entry.slug}: ${approval}`);
  if (market.status !== "open") throw new ResolutionError(`${entry.slug}: השוק כבר ${market.status}`);
  if (fingerprintMarket(market) !== entry.fingerprint) {
    throw new ResolutionError(`${entry.slug}: השאלה השתנתה מאז ההצעה — הריצו propose מחדש והביאו את הדוח לאישור שוב`);
  }
  const blocked = blocking(checkEntry(entry, at.getTime()));
  if (blocked.length) throw new ResolutionError(`${entry.slug}: ${blocked.map((p) => p.message).join("; ")}`);

  const stamp = at.toISOString();
  const resolved: MarketContent = {
    ...market,
    status: entry.verdict === "CANCELLED" ? "cancelled" : "resolved",
    resolutionNote: composeNote(entry),
    resolvedAt: stamp,
    updatedAt: stamp,
  };
  if (entry.verdict === "CANCELLED") delete resolved.resolution;
  else resolved.resolution = entry.verdict;
  return resolved;
}

/* ---------------------------------------------------------------- summary */

export interface RunSummary {
  total: number;
  ready: number;
  blocked: number;
  needsReview: number;
  approved: number;
  rejected: number;
  pending: number;
  applied: number;
  published: number;
  byVerdict: Record<Verdict | "none", number>;
}

export function summarizeRun(run: ResolutionRun, now: number = Date.now()): RunSummary {
  const s: RunSummary = {
    total: run.entries.length,
    ready: 0,
    blocked: 0,
    needsReview: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
    applied: 0,
    published: 0,
    byVerdict: { YES: 0, NO: 0, CANCELLED: 0, none: 0 },
  };
  for (const e of run.entries) {
    const problems = checkEntry(e, now);
    if (blocking(problems).length) s.blocked++;
    else s.ready++;
    if (problems.some((p) => p.level === "review")) s.needsReview++;
    if (e.approval.decision === "approved") s.approved++;
    else if (e.approval.decision === "rejected") s.rejected++;
    else s.pending++;
    if (e.applied) s.applied++;
    if (e.published?.result === "resolved") s.published++;
    s.byVerdict[e.verdict ?? "none"]++;
  }
  return s;
}

const VERDICT_HE: Record<Verdict, string> = { YES: "כן", NO: "לא", CANCELLED: "בוטלו" };

/** The one-line note the board records for a run (data/markets.json → lastUpdateNote). */
export function runNote(run: ResolutionRun, appliedSlugs: string[]): string {
  const applied = new Set(appliedSlugs);
  const byVerdict = new Map<Verdict, number>();
  let approver = "";
  for (const e of run.entries) {
    if (!applied.has(e.slug) || !e.verdict) continue;
    byVerdict.set(e.verdict, (byVerdict.get(e.verdict) ?? 0) + 1);
    approver ||= e.approval.by ?? "";
  }
  const parts = [...byVerdict.entries()].map(([v, n]) => `${n} ${VERDICT_HE[v]}`);
  const who = approver ? `, אושרו על ידי ${approver}` : "";
  return `הוכרעו ${applied.size} שווקים (${parts.join(", ")}) — ריצת הכרעות ${run.runId}${who}`;
}
