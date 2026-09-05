/**
 * The bet-result pipeline: propose → report → approve → apply → publish.
 *
 *   npx tsx scripts/resolve.ts propose [--grace 2] [--limit 20] [--from-server]
 *   npx tsx scripts/resolve.ts report  [run] [--html path] [--no-html] [--json]
 *   npx tsx scripts/resolve.ts approve [run] --by "שם" (--all | --only a,b) [--reject c,d] [--reason "..."]
 *   npx tsx scripts/resolve.ts apply   [run]
 *   npx tsx scripts/resolve.ts publish [run] [--dry-run]
 *   npx tsx scripts/resolve.ts status  [run]
 *
 * `run` is a path, a run id, or omitted for the newest run under
 * data/resolutions/. The rules live in src/lib/resolution.ts; this file is the
 * CLI around them, and the only place that touches the filesystem, the clock
 * and the network.
 *
 * The order is not a suggestion. `apply` writes nothing without a recorded
 * human approval of the exact verdict and evidence in front of it, and
 * `publish` sends nothing that `apply` did not write first.
 */
import fs from "node:fs";
import path from "node:path";
import { MarketsFileSchema, type MarketContent, type MarketsFile } from "../src/lib/content";
import {
  RESOLUTION_RUN_VERSION,
  ResolutionEntrySchema,
  ResolutionRunSchema,
  applyResolution,
  approvalProblem,
  blocking,
  checkEntry,
  composeNote,
  dueMarkets,
  fingerprintMarket,
  fingerprintProposal,
  hoursOverdue,
  isApproved,
  runNote,
  summarizeRun,
  type Problem,
  type ResolutionEntry,
  type ResolutionRun,
  type Verdict,
} from "../src/lib/resolution";

const RUNS_DIR = "data/resolutions";
const MARKETS_FILE = "data/markets.json";
const VERDICT_HE: Record<Verdict, string> = { YES: "כן", NO: "לא", CANCELLED: "בוטל" };

// piping into `head` closes stdout early; that is not an error worth a stack trace
process.stdout.on("error", () => {});

/* ------------------------------------------------------------------- args */

const VALUE_FLAGS = new Set(["grace", "limit", "out", "html", "by", "only", "reject", "reason", "note", "target"]);

function parseArgs(argv: string[]) {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const name = a.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) fail(`הדגל --${name} דורש ערך`);
      flags[name] = value;
      i++;
    } else {
      flags[name] = true;
    }
  }
  return { flags, positional };
}

function fail(message: string): never {
  console.error(`שגיאה: ${message}`);
  process.exit(1);
}

/* --------------------------------------------------------------- run files */

function runPath(runId: string) {
  return path.join(RUNS_DIR, `${runId}.json`);
}

function listRuns(): string[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs
    .readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(RUNS_DIR, f));
}

function resolveRunPath(arg?: string): string {
  if (arg) {
    const candidates = [arg, runPath(arg), path.join(RUNS_DIR, arg)];
    const found = candidates.find((c) => fs.existsSync(c));
    if (!found) fail(`לא נמצאה ריצה בשם ${arg}`);
    return found;
  }
  const runs = listRuns();
  if (!runs.length) fail(`אין ריצות ב-${RUNS_DIR} — התחילו ב-"npm run resolve -- propose"`);
  return runs[runs.length - 1];
}

function loadRun(file: string): ResolutionRun {
  const parsed = ResolutionRunSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    fail(`${file} אינו קובץ ריצה תקין:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  }
  return parsed.data;
}

function saveRun(run: ResolutionRun, file: string) {
  const parsed = ResolutionRunSchema.safeParse(run);
  if (!parsed.success) fail(`הריצה יצאה לא תקינה:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(parsed.data, null, 2) + "\n");
}

function loadMarketsFile(): MarketsFile {
  const parsed = MarketsFileSchema.safeParse(JSON.parse(fs.readFileSync(MARKETS_FILE, "utf8")));
  if (!parsed.success) fail(`${MARKETS_FILE} אינו תקין — הריצו npm run markets:validate`);
  return parsed.data;
}

function saveMarketsFile(file: MarketsFile) {
  const parsed = MarketsFileSchema.safeParse(file);
  if (!parsed.success) {
    fail(`הקובץ היה יוצא לא תקין — לא נכתב כלום:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  }
  fs.writeFileSync(MARKETS_FILE, JSON.stringify(parsed.data, null, 2) + "\n");
}

/* ---------------------------------------------------------------- display */

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

function ago(hours: number): string {
  if (hours < 0) return `בעוד ${Math.round(-hours)} שעות`;
  if (hours < 48) return `לפני ${Math.round(hours)} שעות`;
  return `לפני ${Math.round(hours / 24)} ימים`;
}

function stateOf(entry: ResolutionEntry): string {
  if (entry.published?.result === "resolved") return "פורסם";
  if (entry.published) return `פרסום: ${entry.published.result}`;
  if (entry.applied) return "נכתב לקובץ, ממתין לפרסום";
  if (entry.approval.decision === "approved") return "אושר";
  if (entry.approval.decision === "rejected") return "נדחה";
  if (!entry.verdict) return "ממתין למחקר";
  return blocking(checkEntry(entry)).length ? "חסום" : "ממתין לאישור";
}

function problemLines(problems: Problem[]): string[] {
  return problems.map((p) => `${p.level === "block" ? "  ✗" : "  ⚠"} ${p.message}`);
}

/* ----------------------------------------------------------- the site API */

function siteUrl(): string {
  const url = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) fail("אין SITE_URL (או NEXT_PUBLIC_SITE_URL) בסביבה — אי אפשר לדבר עם השרת");
  return url.replace(/\/+$/, "");
}

function adminToken(): string {
  const token = process.env.ADMIN_TOKEN;
  if (!token) fail("אין ADMIN_TOKEN בסביבה — אי אפשר לדבר עם השרת");
  return token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The site is reached over the public internet; one dropped connection is not a failed publish. */
async function withRetries<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const wait = 2000 * 2 ** i;
      if (i < attempts - 1) {
        console.log(`  ${label} נכשל (${String(err)}) — ניסיון נוסף בעוד ${wait / 1000}s`);
        await sleep(wait);
      }
    }
  }
  throw lastError;
}

interface ServerMarket {
  id: string;
  status: string;
  resolution?: string | null;
  probability: number;
  volume: number;
  tradeCount: number;
}

async function fetchServerMarkets(): Promise<Map<string, ServerMarket>> {
  const url = `${siteUrl()}/api/admin/markets`;
  const json = await withRetries("קריאת השווקים מהשרת", async () => {
    const res = await fetch(url, { headers: { authorization: `Bearer ${adminToken()}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as { ok: boolean; markets: ServerMarket[] };
  });
  return new Map((json.markets ?? []).map((m) => [m.id, m]));
}

/* --------------------------------------------------------------- propose */

async function cmdPropose(flags: Record<string, string | true>) {
  const now = Date.now();
  const grace = Number(flags.grace ?? 0);
  const limit = flags.limit ? Number(flags.limit) : undefined;
  const file = loadMarketsFile();
  const due = dueMarkets(file.markets, now, { graceHours: grace, limit });

  if (!due.length) {
    console.log("אין חוב הכרעות: אף שוק פתוח לא עבר את מועד הסגירה שלו.");
    return;
  }

  // A slug can legitimately appear in two runs (the first was abandoned), but
  // silently proposing it twice is how the same market gets resolved twice.
  const openElsewhere = new Map<string, string>();
  for (const p of listRuns()) {
    const prev = loadRun(p);
    for (const e of prev.entries) {
      if (!e.published && e.approval.decision !== "rejected") openElsewhere.set(e.slug, prev.runId);
    }
  }

  let live: Map<string, ServerMarket> | null = null;
  if (flags["from-server"]) {
    live = await fetchServerMarkets();
    console.log(`נמשכו ${live.size} שווקים מהשרת (${siteUrl()})`);
  }
  const fetchedAt = new Date(now).toISOString();

  const entries: ResolutionEntry[] = due.map((m) => {
    const l = live?.get(m.slug);
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
      live: l ? { probability: l.probability, volume: l.volume, tradeCount: l.tradeCount, fetchedAt } : undefined,
    });
  });

  const runId = new Date(now).toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const out = typeof flags.out === "string" ? flags.out : runPath(runId);
  if (fs.existsSync(out) && !flags.force) fail(`${out} כבר קיים — הוסיפו --force כדי לדרוס`);

  const run: ResolutionRun = {
    version: RESOLUTION_RUN_VERSION,
    runId,
    createdAt: new Date(now).toISOString(),
    createdBy: typeof flags.by === "string" ? flags.by : "editorial-routine",
    entries,
  };
  saveRun(run, out);

  console.log(`ריצת הכרעות ${runId}: ${entries.length} שווקים ממתינים להכרעה → ${out}\n`);
  for (const e of entries) {
    const overdue = hoursOverdue({ closesAt: e.market.closesAt }, now);
    const dup = openElsewhere.get(e.slug);
    console.log(`- ${e.slug} (נסגר ${ago(overdue)}, מחיר פתיחה ${pct(e.market.initialProbability)})`);
    console.log(`  ${e.market.title}`);
    console.log(`  קריטריון: ${e.market.resolutionCriteria.replace(/\s+/g, " ").slice(0, 220)}`);
    if (e.live) console.log(`  באתר: מחיר ${pct(e.live.probability)}, מחזור ${ils(e.live.volume)} ב-${e.live.tradeCount} עסקאות`);
    if (dup) console.log(`  ⚠ השוק הזה מופיע גם בריצה ${dup} שטרם פורסמה`);
  }
  console.log(`\nהשלב הבא: מחקר. לכל רשומה מלאו verdict, confidence, note, evidence ו-searchedFor,`);
  console.log(`ואז: npm run resolve -- report ${runId}`);
}

/* ---------------------------------------------------------------- report */

function reportRows(run: ResolutionRun, now: number) {
  return run.entries.map((e) => ({
    entry: e,
    problems: checkEntry(e, now),
    overdue: hoursOverdue({ closesAt: e.market.closesAt }, now),
    state: stateOf(e),
  }));
}

function cmdReport(runFile: string, flags: Record<string, string | true>) {
  const run = loadRun(runFile);
  const now = Date.now();
  const rows = reportRows(run, now);
  const summary = summarizeRun(run, now);

  if (flags.json) {
    console.log(JSON.stringify({ run: run.runId, summary, rows: rows.map((r) => ({ ...r, entry: r.entry })) }, null, 2));
    return;
  }

  console.log(`דוח הכרעות ${run.runId} — ${summary.total} שווקים, נוצר ${run.createdAt}\n`);
  rows.forEach((row, i) => {
    const e = row.entry;
    console.log(`${i + 1}. ${e.slug} · ${row.state}`);
    console.log(`   ${e.market.title}`);
    const live = e.live ? ` · באתר ${pct(e.live.probability)} · מחזור ${ils(e.live.volume)} (${e.live.tradeCount} עסקאות)` : "";
    console.log(`   נסגר ${ago(row.overdue)} · מחיר פתיחה ${pct(e.market.initialProbability)}${live}`);
    console.log(`   קריטריון: ${e.market.resolutionCriteria.replace(/\s+/g, " ")}`);
    if (e.verdict) {
      const conf = e.confidence === null ? "?" : pct(e.confidence);
      console.log(`   הכרעה מוצעת: ${VERDICT_HE[e.verdict]} (${e.verdict}) · ביטחון ${conf}`);
      console.log(`   נימוק: ${composeNote(e).replace(/\n+/g, " ")}`);
    } else {
      console.log("   הכרעה מוצעת: — (טרם נחקר)");
    }
    for (const ev of e.evidence) {
      console.log(`   ראיה: ${ev.title} — ${ev.url}`);
      console.log(`         "${ev.quote.replace(/\s+/g, " ").slice(0, 200)}"`);
    }
    if (e.searchedFor.length) console.log(`   חיפושים: ${e.searchedFor.join(" | ")}`);
    if (e.early) console.log(`   הכרעה מוקדמת: ${e.early.reason}`);
    if (e.approval.decision !== "pending") {
      console.log(`   אישור: ${e.approval.decision === "approved" ? "אושר" : "נדחה"} על ידי ${e.approval.by} ב-${e.approval.at}${e.approval.reason ? ` (${e.approval.reason})` : ""}`);
    }
    for (const line of problemLines(row.problems)) console.log(line);
    console.log("");
  });

  console.log(
    `סיכום: ${summary.byVerdict.YES} כן · ${summary.byVerdict.NO} לא · ${summary.byVerdict.CANCELLED} ביטולים · ${summary.byVerdict.none} ללא הכרעה`,
  );
  console.log(
    `מוכנות: ${summary.ready} מוכנות לאישור, ${summary.blocked} חסומות, ${summary.needsReview} דורשות עין · אושרו ${summary.approved}, נדחו ${summary.rejected}, ממתינות ${summary.pending}`,
  );

  const htmlPath = typeof flags.html === "string" ? flags.html : path.join(RUNS_DIR, `${run.runId}.report.html`);
  if (!flags["no-html"]) {
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, renderHtml(run, now));
    console.log(`\nדוח לקריאה: ${htmlPath}`);
  }
  console.log(`לאישור: npm run resolve -- approve ${run.runId} --by "<שם>" --all`);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderHtml(run: ResolutionRun, now: number): string {
  const rows = reportRows(run, now);
  const s = summarizeRun(run, now);
  const cards = rows
    .map(({ entry: e, problems, overdue, state }) => {
      const verdictClass = e.verdict ? e.verdict.toLowerCase() : "none";
      const verdictLabel = e.verdict ? `${VERDICT_HE[e.verdict]} · ${e.verdict}` : "טרם נחקר";
      const evidence = e.evidence
        .map(
          (ev) => `<li><a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.title)}</a>
             <div class="host">${esc(new URL(ev.url).hostname)} · נבדק ${esc(ev.checkedAt.slice(0, 16).replace("T", " "))}</div>
             <blockquote>${esc(ev.quote)}</blockquote></li>`,
        )
        .join("");
      const problemsHtml = problems.length
        ? `<ul class="problems">${problems
            .map((p) => `<li class="${p.level}">${p.level === "block" ? "חוסם" : "לבדיקה"}: ${esc(p.message)}</li>`)
            .join("")}</ul>`
        : "";
      const live = e.live
        ? `<span>באתר ${pct(e.live.probability)}</span><span>מחזור ${ils(e.live.volume)}</span><span>${e.live.tradeCount} עסקאות</span>`
        : "";
      return `<article class="card ${verdictClass}">
        <header>
          <span class="verdict ${verdictClass}">${esc(verdictLabel)}</span>
          <span class="state">${esc(state)}</span>
          <code>${esc(e.slug)}</code>
        </header>
        <h2>${esc(e.market.title)}</h2>
        <div class="meta"><span>נסגר ${esc(ago(overdue))}</span><span>מחיר פתיחה ${pct(e.market.initialProbability)}</span>${live}${
          e.confidence !== null ? `<span>ביטחון ${pct(e.confidence)}</span>` : ""
        }</div>
        <h3>קריטריון ההכרעה</h3><p class="criteria">${esc(e.market.resolutionCriteria)}</p>
        ${e.verdict ? `<h3>הנימוק שיפורסם באתר</h3><p class="note">${esc(composeNote(e))}</p>` : ""}
        ${evidence ? `<h3>ראיות</h3><ul class="evidence">${evidence}</ul>` : ""}
        ${e.searchedFor.length ? `<h3>חיפושים שהורצו</h3><p class="searches">${e.searchedFor.map(esc).join(" · ")}</p>` : ""}
        ${e.early ? `<p class="early">הכרעה לפני מועד הסגירה: ${esc(e.early.reason)}</p>` : ""}
        ${
          e.approval.decision !== "pending"
            ? `<p class="approval">${e.approval.decision === "approved" ? "אושר" : "נדחה"} על ידי ${esc(e.approval.by ?? "")} ב-${esc((e.approval.at ?? "").slice(0, 16).replace("T", " "))}</p>`
            : ""
        }
        ${problemsHtml}
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>דוח הכרעות ${esc(run.runId)}</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --ink:#14161a; --muted:#5b6472; --line:#e3e6ea;
          --yes:#0f7b52; --no:#a12a2a; --cancel:#6b5a00; --block:#a12a2a; --review:#8a6d00; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f1216; --card:#171b21; --ink:#e9edf2; --muted:#9aa4b2; --line:#252b33;
            --yes:#4ade80; --no:#f87171; --cancel:#fbbf24; --block:#f87171; --review:#fbbf24; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 64px; background:var(--bg); color:var(--ink);
         font:15px/1.6 system-ui,-apple-system,"Segoe UI",Arial,sans-serif; }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; }
  .totals { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; }
  .totals span { background:var(--card); border:1px solid var(--line); border-radius:999px; padding:4px 12px; font-size:13px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; margin-bottom:16px; }
  .card header { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
  .verdict { font-weight:700; font-size:13px; border-radius:999px; padding:3px 10px; border:1px solid currentColor; }
  .verdict.yes { color:var(--yes); } .verdict.no { color:var(--no); }
  .verdict.cancelled { color:var(--cancel); } .verdict.none { color:var(--muted); }
  .state { font-size:13px; color:var(--muted); }
  code { font-size:12px; color:var(--muted); margin-inline-start:auto; }
  h2 { font-size:17px; margin:0 0 8px; }
  h3 { font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin:16px 0 4px; }
  .meta { display:flex; flex-wrap:wrap; gap:6px 14px; color:var(--muted); font-size:13px; }
  .criteria, .note, .searches { margin:0; white-space:pre-wrap; }
  .note { background:rgba(127,127,127,.08); border-radius:8px; padding:10px 12px; }
  ul.evidence { list-style:none; margin:0; padding:0; }
  ul.evidence li { border-top:1px solid var(--line); padding:10px 0; }
  ul.evidence a { color:inherit; }
  .host { color:var(--muted); font-size:12px; }
  blockquote { margin:6px 0 0; padding-inline-start:12px; border-inline-start:3px solid var(--line); color:var(--muted); }
  .problems { list-style:none; margin:14px 0 0; padding:0; font-size:13px; }
  .problems .block { color:var(--block); } .problems .review { color:var(--review); }
  .early, .approval { font-size:13px; color:var(--muted); }
  footer { color:var(--muted); font-size:13px; margin-top:28px; }
  footer code { display:block; margin:8px 0 0; color:inherit; }
</style></head>
<body><main>
<h1>דוח הכרעות ${esc(run.runId)}</h1>
<p class="sub">${s.total} שווקים שמועד הסגירה שלהם עבר. נוצר ${esc(run.createdAt.slice(0, 16).replace("T", " "))} · הופק ${esc(new Date(now).toISOString().slice(0, 16).replace("T", " "))}</p>
<div class="totals">
  <span>${s.byVerdict.YES} כן</span><span>${s.byVerdict.NO} לא</span><span>${s.byVerdict.CANCELLED} ביטולים</span>
  <span>${s.byVerdict.none} ללא הכרעה</span><span>${s.blocked} חסומות</span><span>${s.needsReview} דורשות עין</span>
  <span>${s.approved} אושרו</span><span>${s.published} פורסמו</span>
</div>
${cards}
<footer>אף הכרעה לא נכתבת לאתר בלי אישור מפורש. לאישור הכל:
<code>npm run resolve -- approve ${esc(run.runId)} --by "&lt;שם&gt;" --all</code>
לאישור חלקי, החליפו את --all ב---only slug-a,slug-b, ולדחייה: --reject slug-c --reason "..."</footer>
</main></body></html>
`;
}

/* --------------------------------------------------------------- approve */

function cmdApprove(runFile: string, flags: Record<string, string | true>) {
  const run = loadRun(runFile);
  const by = typeof flags.by === "string" ? flags.by.trim() : "";
  if (!by) fail('חסר --by "<שם המאשר>" — אישור הוא של אדם, ובשמו');

  const list = (v: string | true | undefined) =>
    typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];
  const only = list(flags.only);
  const reject = list(flags.reject);
  const all = Boolean(flags.all);
  if (!all && !only.length && !reject.length) fail("ציינו --all, --only slug,slug או --reject slug,slug");

  const known = new Set(run.entries.map((e) => e.slug));
  for (const slug of [...only, ...reject]) if (!known.has(slug)) fail(`${slug} אינו בריצה הזו`);

  const at = new Date().toISOString();
  const reason = typeof flags.reason === "string" ? flags.reason : undefined;
  const approved: string[] = [];
  const rejected: string[] = [];
  const refused: string[] = [];

  for (const e of run.entries) {
    if (reject.includes(e.slug)) {
      if (e.applied) {
        refused.push(`${e.slug}: כבר נכתב לקובץ — דחייה כאן לא תבטל אותו`);
        continue;
      }
      e.approval = { decision: "rejected", by, at, reason };
      rejected.push(e.slug);
      continue;
    }
    const target = all ? !only.length || only.includes(e.slug) : only.includes(e.slug);
    if (!target) continue;
    if (e.applied) {
      refused.push(`${e.slug}: כבר נכתב לקובץ`);
      continue;
    }
    const blocked = blocking(checkEntry(e));
    if (blocked.length) {
      refused.push(`${e.slug}: ${blocked.map((p) => p.message).join("; ")}`);
      continue;
    }
    e.approval = { decision: "approved", by, at, reason, proposalFingerprint: fingerprintProposal(e) };
    approved.push(e.slug);
  }

  if (typeof flags.note === "string") run.note = flags.note;
  saveRun(run, runFile);

  console.log(`אושרו ${approved.length}: ${approved.join(", ") || "—"}`);
  if (rejected.length) console.log(`נדחו ${rejected.length}: ${rejected.join(", ")}`);
  for (const r of refused) console.log(`  לא אושר — ${r}`);
  if (approved.length) console.log(`\nהשלב הבא: npm run resolve -- apply ${run.runId}`);
}

/* ----------------------------------------------------------------- apply */

function cmdApply(runFile: string) {
  const run = loadRun(runFile);
  const file = loadMarketsFile();
  const at = new Date();
  const bySlug = new Map(file.markets.map((m, i) => [m.slug, i] as const));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const e of run.entries) {
    if (e.applied) {
      skipped.push(`${e.slug}: כבר נכתב (${e.applied.at})`);
      continue;
    }
    const problem = approvalProblem(e);
    if (problem) {
      skipped.push(`${e.slug}: ${problem}`);
      continue;
    }
    const idx = bySlug.get(e.slug);
    if (idx === undefined) {
      skipped.push(`${e.slug}: אינו קיים ב-${MARKETS_FILE}`);
      continue;
    }
    try {
      file.markets[idx] = applyResolution(file.markets[idx], e, at);
      e.applied = { at: at.toISOString() };
      applied.push(e.slug);
    } catch (err) {
      skipped.push(String(err instanceof Error ? err.message : err));
    }
  }

  if (!applied.length) {
    console.log("לא נכתבה אף הכרעה.");
    for (const s of skipped) console.log(`  · ${s}`);
    return;
  }

  file.updatedAt = at.toISOString();
  file.lastUpdateNote = runNote(run, applied);
  saveMarketsFile(file);
  saveRun(run, runFile);

  console.log(`נכתבו ${applied.length} הכרעות ל-${MARKETS_FILE}:`);
  for (const slug of applied) {
    const e = run.entries.find((x) => x.slug === slug)!;
    console.log(`  ${VERDICT_HE[e.verdict as Verdict]} · ${slug}`);
  }
  for (const s of skipped) console.log(`  דילוג — ${s}`);
  console.log(`\nlastUpdateNote: ${file.lastUpdateNote}`);
  console.log("השלב הבא: npm run markets:validate, commit, ואז");
  console.log(`npm run resolve -- publish ${run.runId}`);
}

/* --------------------------------------------------------------- publish */

async function cmdPublish(runFile: string, flags: Record<string, string | true>) {
  const run = loadRun(runFile);
  const file = loadMarketsFile();
  const pending = run.entries.filter((e) => e.applied && isApproved(e) && e.published?.result !== "resolved");

  const notApplied = run.entries.filter((e) => isApproved(e) && !e.applied);
  if (notApplied.length) {
    fail(`יש הכרעות מאושרות שטרם נכתבו לקובץ (${notApplied.map((e) => e.slug).join(", ")}) — הריצו apply קודם`);
  }
  if (!pending.length) {
    console.log("אין מה לפרסם: כל ההכרעות המאושרות כבר פורסמו.");
    return;
  }

  const markets: MarketContent[] = [];
  for (const e of pending) {
    const m = file.markets.find((x) => x.slug === e.slug);
    if (!m) fail(`${e.slug} אינו ב-${MARKETS_FILE}`);
    if (m.status === "open") fail(`${e.slug} עדיין open בקובץ — apply לא הושלם`);
    markets.push(m);
  }

  const target = `${siteUrl()}/api/admin/markets`;
  const note = runNote(run, pending.map((e) => e.slug));
  const source = `resolve-${run.runId}`.slice(0, 40);

  if (flags["dry-run"]) {
    console.log(`(dry run) היה נשלח POST ל-${target}`);
    console.log(`  source: ${source}`);
    console.log(`  note: ${note}`);
    for (const m of markets) console.log(`  ${m.status}${m.resolution ? `/${m.resolution}` : ""} · ${m.slug}`);
    return;
  }

  console.log(`מפרסם ${markets.length} הכרעות ל-${target}`);
  const token = adminToken();
  const response = await withRetries("פרסום", async () => {
    const res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ markets, note, source }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text}`);
    return JSON.parse(text) as { ok: boolean; added: string[]; updated: string[]; resolved: string[]; skipped: string[] };
  });

  const at = new Date().toISOString();
  const resolvedSet = new Set(response.resolved ?? []);
  for (const e of pending) {
    e.published = {
      at,
      target,
      result: resolvedSet.has(e.slug) ? "resolved" : "skipped",
      detail: resolvedSet.has(e.slug) ? undefined : "השרת לא דיווח על הכרעה — ייתכן שהשוק כבר היה מוכרע אצלו",
    };
  }
  run.publish = { at, target, ok: Boolean(response.ok), response: JSON.stringify(response).slice(0, 4000) };
  saveRun(run, runFile);
  console.log(`תשובת השרת: ${JSON.stringify(response)}`);

  // The POST said what it did; this says what the site now shows.
  console.log("\nאימות מול השרת:");
  const server = await fetchServerMarkets();
  let bad = 0;
  for (const e of pending) {
    const m = server.get(e.slug);
    if (!m) {
      console.log(`  ✗ ${e.slug}: השרת לא מכיר את השוק`);
      e.published = { ...e.published!, result: "failed", detail: "השרת לא מכיר את השוק" };
      bad++;
    } else if (m.status === "open") {
      console.log(`  ✗ ${e.slug}: עדיין open בשרת`);
      e.published = { ...e.published!, result: "failed", detail: "עדיין open בשרת" };
      bad++;
    } else {
      console.log(`  ✓ ${e.slug}: ${m.status}${m.resolution ? `/${m.resolution}` : ""}`);
    }
  }
  saveRun(run, runFile);
  if (bad) {
    console.error(`\n${bad} שווקים לא הוכרעו בשרת — בדקו את הלוג של השרת והריצו publish שוב.`);
    process.exit(1);
  }
  console.log(`\nהכל פורסם. ${pending.length} שווקים מוכרעים באתר.`);
}

/* ---------------------------------------------------------------- status */

function cmdStatus(runFile: string) {
  const run = loadRun(runFile);
  const now = Date.now();
  const s = summarizeRun(run, now);
  console.log(`ריצה ${run.runId} (${runFile}) · נוצרה ${run.createdAt} על ידי ${run.createdBy}`);
  if (run.note) console.log(`הערה: ${run.note}`);
  console.log(
    `${s.total} שווקים · ${s.ready} מוכנות, ${s.blocked} חסומות · אושרו ${s.approved}, נדחו ${s.rejected}, ממתינות ${s.pending} · נכתבו ${s.applied}, פורסמו ${s.published}`,
  );
  for (const e of run.entries) console.log(`  ${stateOf(e).padEnd(24)} ${e.verdict ?? "—"}\t${e.slug}`);

  const next = s.byVerdict.none
    ? "מחקר: מלאו verdict ו-evidence לרשומות שנותרו"
    : s.pending
      ? `npm run resolve -- report ${run.runId}  →  approve`
      : s.approved > s.applied
        ? `npm run resolve -- apply ${run.runId}`
        : s.applied > s.published
          ? `npm run resolve -- publish ${run.runId}`
          : "אין מה לעשות — הריצה הושלמה";
  console.log(`\nהשלב הבא: ${next}`);
}

/* ------------------------------------------------------------------ main */

const USAGE = `שימוש:
  npm run resolve -- propose [--grace 2] [--limit 20] [--from-server] [--out path]
  npm run resolve -- report  [run] [--html path] [--no-html] [--json]
  npm run resolve -- approve [run] --by "שם" (--all | --only a,b) [--reject c] [--reason "..."]
  npm run resolve -- apply   [run]
  npm run resolve -- publish [run] [--dry-run]
  npm run resolve -- status  [run]`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseArgs(rest);
  switch (cmd) {
    case "propose":
      return cmdPropose(flags);
    case "report":
      return cmdReport(resolveRunPath(positional[0]), flags);
    case "approve":
      return cmdApprove(resolveRunPath(positional[0]), flags);
    case "apply":
      return cmdApply(resolveRunPath(positional[0]));
    case "publish":
      return cmdPublish(resolveRunPath(positional[0]), flags);
    case "status":
      return cmdStatus(resolveRunPath(positional[0]));
    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
