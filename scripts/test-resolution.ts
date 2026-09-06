/**
 * The gates of the bet-result pipeline (src/lib/resolution.ts).
 *
 * A resolution pays out virtual money and cannot be undone from the UI, so the
 * promises worth pinning down are the ones that stop a wrong one:
 *   1. nothing reaches the board without a named human approval;
 *   2. the approval covers the exact verdict and evidence that were shown —
 *      editing either afterwards invalidates it;
 *   3. the question itself may not change between propose and apply;
 *   4. YES needs a real source, NO needs at least the record of the searches
 *      that came back empty, CANCELLED needs a reason;
 *   5. applying a verdict never touches price, liquidity or wording;
 *   6. and, the second door into the same room: a payload that arrives at
 *      `upsertMarkets` already saying "resolved" cannot settle a market unless it
 *      came from a path that passed 1–5. That last one runs against a throwaway
 *      SQLite database, because it is the balances it is about.
 *
 *   npm run test:resolution
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CONTENT_SETTLEMENT_SOURCE,
  applyResolution,
  approvalProblem,
  blocking,
  checkEntry,
  composeNote,
  dueMarkets,
  fingerprintMarket,
  fingerprintProposal,
  isApproved,
  isReady,
  maySettle,
  publishSource,
  ResolutionEntrySchema,
  ResolutionError,
  runNote,
  settlementRefusal,
  summarizeRun,
  type ResolutionEntry,
} from "../src/lib/resolution";
import { MarketContentSchema, type MarketContent } from "../src/lib/content";

// the db module reads DATABASE_URL lazily, on the first getDb() — setting it here,
// before the settlement section runs, keeps that section off the real database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-resolution-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { upsertMarkets } from "../src/lib/sync";

const NOW = Date.parse("2026-09-05T12:00:00Z");
const HOUR = 3_600_000;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) return;
  failures++;
  console.error(`✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail));
}
function throws(name: string, fn: () => unknown, match?: string) {
  try {
    fn();
    check(name, false, "no error was thrown");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    check(name, err instanceof ResolutionError && (!match || message.includes(match)), message);
  }
}

/* --------------------------------------------------------------- fixtures */

function market(over: Partial<MarketContent> = {}): MarketContent {
  return MarketContentSchema.parse({
    slug: "poll-channel14-likud-30",
    title: "האם ערוץ 14 יפרסם סקר שנותן לליכוד 30 מנדטים ומעלה עד 4.9.2026?",
    description: "שאלת בדיקה על פרסום סקר, מנוסחת כמו שאלה אמיתית על הלוח.",
    resolutionCriteria: 'יוכרע "כן" אם עד 4.9.2026 יפורסם בערוץ 14 סקר שנותן לליכוד 30 מנדטים ומעלה. אחרת — "לא".',
    category: "polls",
    tags: ["סקר"],
    people: [],
    closesAt: "2026-09-04T21:00:00+03:00",
    initialProbability: 0.35,
    liquidity: 2000,
    sources: [{ title: "ynet", url: "https://www.ynet.co.il/news/article/example" }],
    createdAt: "2026-09-01T09:00:00+03:00",
    createdBy: "seed",
    ...over,
  });
}

function entry(m: MarketContent, over: Partial<ResolutionEntry> = {}): ResolutionEntry {
  return ResolutionEntrySchema.parse({
    slug: m.slug,
    market: {
      title: m.title,
      subtitle: m.subtitle,
      resolutionCriteria: m.resolutionCriteria,
      category: m.category,
      closesAt: m.closesAt,
      initialProbability: m.initialProbability,
      sources: m.sources,
    },
    fingerprint: fingerprintMarket(m),
    verdict: "YES",
    confidence: 0.92,
    note: "ב-3.9.2026 פרסם ערוץ 14 סקר של שלמה פילבר שנתן לליכוד 31 מנדטים, מעל הסף שהשאלה קבעה.",
    evidence: [
      {
        title: "ערוץ 14: סקר פילבר — הליכוד 31",
        url: "https://www.now14.co.il/article/example",
        quote: "בסקר שפורסם הערב בערוץ 14 מקבל הליכוד 31 מנדטים",
        checkedAt: "2026-09-05T09:00:00+03:00",
      },
    ],
    searchedFor: ["סקר ערוץ 14 ליכוד מנדטים", "פילבר סקר 3.9.2026"],
    researchedAt: "2026-09-05T09:05:00+03:00",
    ...over,
  });
}

/** The approval a human's click would leave behind. */
function approve(e: ResolutionEntry, by = "אופיר"): ResolutionEntry {
  return {
    ...e,
    approval: { decision: "approved", by, at: "2026-09-05T11:00:00+03:00", proposalFingerprint: fingerprintProposal(e) },
  };
}

/* ------------------------------------------------------------ due markets */

{
  const closed = market();
  const openLater = market({ slug: "still-open", closesAt: "2026-10-01T21:00:00+03:00" });
  const alreadyResolved = market({
    slug: "already-done",
    status: "resolved",
    resolution: "NO",
    resolutionNote: "המועד עבר והאירוע לא קרה. מקור: https://www.ynet.co.il/news/article/example",
  });
  const due = dueMarkets([closed, openLater, alreadyResolved], NOW);
  check("only open markets past their deadline are due", due.length === 1 && due[0].slug === closed.slug, due.map((m) => m.slug));

  const older = market({ slug: "older", closesAt: "2026-09-01T21:00:00+03:00" });
  const order = dueMarkets([closed, older], NOW).map((m) => m.slug);
  check("the most overdue market comes first", order[0] === "older", order);

  const justClosed = market({ slug: "just-closed", closesAt: new Date(NOW - HOUR).toISOString() });
  check("a grace window holds back a market that closed an hour ago", dueMarkets([justClosed], NOW, { graceHours: 6 }).length === 0);
  check("...and lets it through once the grace has passed", dueMarkets([justClosed], NOW, { graceHours: 0.5 }).length === 1);
  check("limit caps the batch", dueMarkets([closed, older], NOW, { limit: 1 }).length === 1);
}

/* ----------------------------------------------------------------- gates */

{
  const m = market();
  check("a researched YES with a real source is ready", isReady(entry(m), NOW));

  const noVerdict = entry(m, { verdict: null });
  check("a proposal with no verdict is blocked", !isReady(noVerdict, NOW));

  const noEvidence = entry(m, { evidence: [] });
  check("YES without evidence is blocked", !isReady(noEvidence, NOW));

  const weak = entry(m, {
    evidence: [
      {
        title: "ציוץ",
        url: "https://x.com/someone/status/1",
        quote: "הליכוד 31 בסקר של ערוץ 14 הערב",
        checkedAt: "2026-09-05T09:00:00+03:00",
      },
    ],
  });
  check("YES resting only on a tweet is blocked", !isReady(weak, NOW));

  const noWithoutSearches = entry(m, { verdict: "NO", evidence: [], searchedFor: ["סקר ערוץ 14"] });
  check("NO with a single recorded search is blocked", !isReady(noWithoutSearches, NOW));

  const noWithSearches = entry(m, {
    verdict: "NO",
    evidence: [],
    note: "עד מועד הסגירה לא פורסם בערוץ 14 שום סקר שנותן לליכוד 30 מנדטים ומעלה; החיפושים חזרו ריקים.",
    searchedFor: ["סקר ערוץ 14 ליכוד מנדטים", "פילבר סקר ספטמבר 2026"],
  });
  check("NO documented by empty searches is allowed", isReady(noWithSearches, NOW));
  check("...but it is flagged for a human to look at", checkEntry(noWithSearches, NOW).some((p) => p.level === "review"));

  const shortNote = entry(m, { note: "כן", evidence: [] });
  check("a one-word note is blocked", !isReady(shortNote, NOW));

  const emoji = entry(m, { note: `${entry(m).note} 🎉` });
  check("an emoji in the note is blocked (the site schema forbids it)", !isReady(emoji, NOW));

  const noConfidence = entry(m, { confidence: null });
  check("a proposal with no confidence is blocked", !isReady(noConfidence, NOW));

  const unsure = entry(m, { confidence: 0.5 });
  check("low confidence does not block, it asks for a human", isReady(unsure, NOW) && checkEntry(unsure, NOW).some((p) => p.level === "review"));

  const future = market({ slug: "future", closesAt: "2026-10-01T21:00:00+03:00" });
  const early = entry(future);
  check("resolving before the deadline is blocked", !isReady(early, NOW));
  check(
    "...unless the run says why",
    isReady({ ...early, early: { reason: "כפילות מדויקת של שוק אחר, כל הכסף מוחזר" }, verdict: "CANCELLED", evidence: [] }, NOW),
  );

  const cancelledNoReason = entry(m, { verdict: "CANCELLED", note: "לא ניתן להכרעה", evidence: [] });
  check("cancelling without an explanation is blocked", !isReady(cancelledNoReason, NOW));
}

/* ------------------------------------------------------------- the notes */

{
  const m = market();
  const e = entry(m);
  check("the evidence URL is appended to the note the board shows", composeNote(e).includes(e.evidence[0].url));
  const withUrl = entry(m, { note: `נתון בכתבה https://www.now14.co.il/article/example — הליכוד 31 מנדטים, מעל הסף.` });
  check("...and not appended twice when the note already carries it", withUrl.note === composeNote(withUrl));
}

/* -------------------------------------------------------------- approval */

{
  const m = market();
  const e = entry(m);
  check("a fresh proposal is not approved", !isApproved(e) && approvalProblem(e) === "ממתין לאישור");

  const approved = approve(e);
  check("an approval with a name, a time and a fingerprint counts", isApproved(approved) && approvalProblem(approved) === null);

  const noName = { ...e, approval: { decision: "approved" as const, at: "2026-09-05T11:00:00+03:00" } };
  check("an unsigned approval does not count", !isApproved(noName));

  const edited: ResolutionEntry = { ...approved, verdict: "NO" };
  check("flipping the verdict after approval invalidates it", !isApproved(edited));
  check("...and says so", (approvalProblem(edited) ?? "").includes("השתנתה"));

  const reworded: ResolutionEntry = { ...approved, note: `${approved.note} ובנוסף פורסם סקר נוסף.` };
  check("rewriting the note after approval invalidates it", !isApproved(reworded));

  const moreEvidence: ResolutionEntry = {
    ...approved,
    evidence: [...approved.evidence, { ...approved.evidence[0], url: "https://www.ynet.co.il/news/article/other" }],
  };
  check("adding evidence after approval invalidates it", !isApproved(moreEvidence));

  const rejected: ResolutionEntry = { ...e, approval: { decision: "rejected", by: "אופיר", at: "2026-09-05T11:00:00+03:00" } };
  check("a rejection is not an approval", !isApproved(rejected));
}

/* ----------------------------------------------------------------- apply */

{
  const m = market();
  const approved = approve(entry(m));
  const at = new Date(NOW);
  const out = applyResolution(m, approved, at);

  check("the market is resolved", out.status === "resolved" && out.resolution === "YES");
  check("the note the users read is the composed one", out.resolutionNote === composeNote(approved));
  check("resolvedAt and updatedAt are stamped", out.resolvedAt === at.toISOString() && out.updatedAt === at.toISOString());
  check(
    "what people traded on is untouched",
    out.initialProbability === m.initialProbability &&
      out.liquidity === m.liquidity &&
      out.slug === m.slug &&
      out.title === m.title &&
      out.closesAt === m.closesAt &&
      out.resolutionCriteria === m.resolutionCriteria,
  );
  check("the resolved market still validates against the site schema", MarketContentSchema.safeParse(out).success);

  const cancelled = approve(
    entry(m, {
      verdict: "CANCELLED",
      note: "השאלה התבססה על הנחה שגויה: ערוץ 14 הפסיק לפרסם סקרים בפורמט הזה, אין מקור מכריע. כל הכסף מוחזר.",
      evidence: [],
    }),
  );
  const cancelledOut = applyResolution(m, cancelled, at);
  check("a cancelled market carries no resolution", cancelledOut.status === "cancelled" && cancelledOut.resolution === undefined);
  check("a cancelled market still validates", MarketContentSchema.safeParse(cancelledOut).success);

  throws("apply refuses an unapproved proposal", () => applyResolution(m, entry(m), at), "ממתין לאישור");
  throws(
    "apply refuses a proposal edited after approval",
    () => applyResolution(m, { ...approved, verdict: "NO" }, at),
    "השתנתה אחרי האישור",
  );
  throws(
    "apply refuses a market whose wording changed since the proposal",
    () => applyResolution(market({ title: "האם ערוץ 14 יפרסם סקר עם 25 מנדטים ומעלה עד 4.9.2026?" }), approved, at),
    "השאלה השתנתה",
  );
  throws(
    "apply refuses a market that is already resolved",
    () => applyResolution(out, { ...approved, approval: { ...approved.approval } }, at),
    "כבר",
  );
  throws(
    "apply refuses an approval of something the gates block",
    () => {
      const bad = { ...entry(m, { evidence: [] }) };
      return applyResolution(m, approve(bad), at);
    },
    "בלי ראיה",
  );
}

/* --------------------------------------------------------------- summary */

{
  const m = market();
  const other = market({ slug: "second-question", closesAt: "2026-09-03T21:00:00+03:00" });
  const run = {
    version: 1 as const,
    runId: "2026-09-05-1200",
    createdAt: "2026-09-05T12:00:00Z",
    createdBy: "editorial-routine",
    entries: [
      approve(entry(m)),
      entry(other, {
        slug: other.slug,
        verdict: "NO",
        evidence: [],
        note: "המועד עבר ולא פורסם דבר; שני חיפושים חזרו ריקים.",
        searchedFor: ["חיפוש א", "חיפוש ב"],
      }),
    ],
  };
  const s = summarizeRun(run, NOW);
  check("the summary counts verdicts", s.byVerdict.YES === 1 && s.byVerdict.NO === 1, s.byVerdict);
  check("the summary counts approvals", s.approved === 1 && s.pending === 1, s);
  check("the summary counts what still needs an eye", s.needsReview === 1, s);

  const note = runNote(run, [m.slug]);
  check("the board note names the run and the approver", note.includes("2026-09-05-1200") && note.includes("אופיר"), note);
  check("the board note counts what was applied", note.includes("1") && note.includes("כן"), note);
}

/* --------------------------------------------------- blocking() plumbing */

{
  const problems = checkEntry(entry(market(), { verdict: null }), NOW);
  check("blocking() keeps only the blockers", blocking(problems).every((p) => p.level === "block") && blocking(problems).length > 0);
}

/* ------------------------------------------------- the settlement gate */

{
  check("the publish step's own source may settle", maySettle(publishSource("2026-09-05-1200")));
  check("...and it fits the 40 characters the admin API allows", publishSource("2026-09-05-1200").length <= 40);
  check("a sync of data/markets.json may settle", maySettle(CONTENT_SETTLEMENT_SOURCE));

  // every path that has not been through an approval, named the way it names itself
  for (const source of ["editorial-cron", "editorial-cli", "routine", "admin", "sync", "startup", "content", "cron-sync"]) {
    check(`"${source}" may not settle`, !maySettle(source), source);
    check(`...and the refusal says how to do it properly ("${source}")`, (settlementRefusal(source) ?? "").includes("npm run resolve"));
  }
  check("an allowed source draws no refusal", settlementRefusal(CONTENT_SETTLEMENT_SOURCE) === null);
}

/*
 * The gate where it counts: `upsertMarkets` calls `settleMarket`, which credits
 * balances and cannot be undone from the site. The hourly generator used to reach
 * it with a MarketContent that simply said `"status": "resolved"`, so this runs the
 * real function against a real database and checks the market is still open
 * afterwards.
 */
async function checkSettlementGate() {
  const db = await getDb();
  const statusOf = async (slug: string) => (await db.query.markets.findFirst({ where: eq(schema.markets.id, slug) }))?.status;

  const open = market({ slug: "gate-question", closesAt: "2026-09-04T21:00:00+03:00" });
  const verdict: MarketContent = {
    ...open,
    status: "resolved",
    resolution: "YES",
    resolutionNote: "ב-3.9.2026 פרסם ערוץ 14 סקר שנתן לליכוד 31 מנדטים.\n\nמקור: https://www.now14.co.il/article/example",
    resolvedAt: "2026-09-05T09:00:00+03:00",
  };

  await upsertMarkets([open], "startup", { settlementSource: CONTENT_SETTLEMENT_SOURCE });
  check("the question is on the board and open", (await statusOf(open.slug)) === "open");

  for (const source of ["editorial-cron", "routine", "admin"]) {
    const r = await upsertMarkets([verdict], source);
    check(`a resolved payload from "${source}" settles nothing`, r.resolved.length === 0 && r.refused.includes(open.slug), r);
    check(`...and the market is still open after it ("${source}")`, (await statusOf(open.slug)) === "open");
  }

  const cancelling = await upsertMarkets([{ ...verdict, status: "cancelled", resolution: undefined }], "editorial-cron");
  check("a cancellation from the generator is refused too", cancelling.resolved.length === 0 && cancelling.refused.includes(open.slug));
  check("...and the market is still open", (await statusOf(open.slug)) === "open");

  const published = await upsertMarkets([verdict], publishSource("2026-09-05-1200"));
  check("the publish step does settle it", published.resolved.includes(open.slug) && published.refused.length === 0, published);
  check("...and the market is resolved on the board", (await statusOf(open.slug)) === "resolved");
}

checkSettlementGate()
  .catch((err) => {
    failures++;
    console.error("✗ the settlement gate section threw", err);
  })
  .finally(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (failures) {
      console.error(`\n${failures} failure(s)`);
      process.exit(1);
    }
    console.log("✓ resolution: due detection, gates, approval integrity, apply semantics and the settlement gate all hold");
  });
