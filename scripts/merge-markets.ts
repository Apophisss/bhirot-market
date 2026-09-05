/**
 * Merges a batch of generated markets into data/markets.json.
 *
 *   npx tsx scripts/merge-markets.ts batch.json [--note "..."]
 *
 * The batch file is `{ "markets": [...], "newPeople": [...] }` or a bare array.
 * Each market is normalised, defaulted, de-duplicated against what already
 * exists (by slug, by title overlap, and against every open question it looks
 * like) and appended. People referenced under `newPeople` are added to
 * data/people.json so `npm run people:fetch` can pull their photos.
 *
 * The duplicate gate has two levels, because the lexical signals cannot tell an
 * "האם נתניהו יעמוד בראש הממשלה הבאה" from an "האם איזנקוט יעמוד בראש הממשלה
 * הבאה" on their own:
 *
 *   block  — the titles overlap past DUPLICATE_THRESHOLD. Rejected outright.
 *   review — it resembles an open question some other way (same closing window,
 *            same criteria vocabulary, same cited articles, same words reversed).
 *            Rejected too, unless the batch entry carries a one-line
 *            `notDuplicateOf: { "<slug>": "<what resolves each one differently>" }`
 *            for that question. Writing that line is the check: it cannot be
 *            written without opening the other question's resolutionCriteria.
 *
 * `notDuplicateOf` is a batch-only field — the schema strips it, so it never
 * reaches data/markets.json.
 */
import fs from "node:fs";
import { clampAppeal } from "../src/lib/appeal";
import { clampTopicality } from "../src/lib/topicality";
import { MarketsFileSchema, PeopleFileSchema, MarketContentSchema } from "../src/lib/content";
import { duplicateRisk, REASON_TEXT, type Comparable } from "../src/lib/similarity";

const [, , batchPath, ...rest] = process.argv;
if (!batchPath) {
  console.error("usage: tsx scripts/merge-markets.ts <batch.json> [--note '...']");
  process.exit(1);
}
const noteIdx = rest.indexOf("--note");
const note = noteIdx >= 0 ? rest[noteIdx + 1] : undefined;

const raw = JSON.parse(fs.readFileSync(batchPath, "utf8"));
const incoming: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw.markets ?? []);
const incomingPeople: { id: string; name: string; role?: string; wiki?: string }[] = Array.isArray(raw)
  ? []
  : (raw.newPeople ?? []);

const file = MarketsFileSchema.parse(JSON.parse(fs.readFileSync("data/markets.json", "utf8")));
const peopleFile = PeopleFileSchema.parse(JSON.parse(fs.readFileSync("data/people.json", "utf8")));


// add new people first so market validation can reference them
const peopleIds = new Set(peopleFile.people.map((p) => p.id));
let addedPeople = 0;
for (const p of incomingPeople) {
  if (!p?.id || peopleIds.has(p.id)) continue;
  peopleFile.people.push({ id: p.id, name: p.name, role: p.role, wiki: p.wiki });
  peopleIds.add(p.id);
  addedPeople++;
}

const now = new Date().toISOString();
const existingSlugs = new Set(file.markets.map((m) => m.slug));
/**
 * Everything a new question is checked against: the open board, plus the
 * questions accepted earlier in this same batch — one run writing two questions
 * off one story is the duplicate nothing else would ever catch.
 */
const compareAgainst: Comparable[] = file.markets.filter((m) => m.status === "open");

const added: string[] = [];
const rejected: { slug: string; reason: string }[] = [];
const acknowledged: string[] = [];

for (const item of incoming) {
  const m = item as Record<string, string | number | boolean | undefined | unknown>;
  const slug = String(m.slug ?? "");
  if (!slug) {
    rejected.push({ slug: "(missing)", reason: "no slug" });
    continue;
  }
  if (existingSlugs.has(slug)) {
    rejected.push({ slug, reason: "slug already exists" });
    continue;
  }
  const incomingComparable: Comparable = {
    slug,
    title: String(m.title ?? ""),
    resolutionCriteria: String(m.resolutionCriteria ?? ""),
    closesAt: String(m.closesAt ?? ""),
    sources: Array.isArray(m.sources) ? (m.sources as { url: string }[]) : [],
  };
  // a note per slug the writer had to read to write it; anything else is ignored
  const cleared = new Map<string, string>(
    Object.entries((m.notDuplicateOf ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  );
  const blocked: string[] = [];
  const unread: string[] = [];
  for (const other of compareAgainst) {
    const risk = duplicateRisk(incomingComparable, other);
    if (risk.level === "clear") continue;
    const why = risk.reasons.map((r) => REASON_TEXT[r]).join("; ");
    if (risk.level === "block") {
      blocked.push(`${other.slug} (${why})`);
    } else if (!cleared.get(other.slug)?.trim()) {
      unread.push(`${other.slug} (${why})`);
    } else {
      acknowledged.push(`${slug} ↔ ${other.slug}: ${cleared.get(other.slug)!.trim()}`);
    }
  }
  if (blocked.length) {
    rejected.push({ slug, reason: `duplicate of ${blocked.join(", ")}` });
    continue;
  }
  if (unread.length) {
    rejected.push({
      slug,
      reason:
        `looks like ${unread.join(", ")} — read each one's resolutionCriteria, then either drop this question or ` +
        `add "notDuplicateOf": { ${unread.map((u) => `"${u.split(" ")[0]}": "<what resolves each one differently>"`).join(", ")} }`,
    });
    continue;
  }
  const people = (Array.isArray(m.people) ? (m.people as string[]) : []).filter((id) => peopleIds.has(id));
  const candidate = MarketContentSchema.safeParse({
    ...m,
    subtitle: m.subtitle || undefined,
    people,
    tags: Array.isArray(m.tags) ? m.tags : [],
    sources: Array.isArray(m.sources) ? m.sources : [],
    liquidity: typeof m.liquidity === "number" ? m.liquidity : 2000,
    // the creator's 1..5 rating; anything missing or off-scale lands on the neutral default
    appeal: clampAppeal(typeof m.appeal === "number" ? m.appeal : undefined),
    // ...and the news rating, whose default is the bottom of its scale: a batch that
    // does not mention topicality merges as a board of evergreen questions
    topicality: clampTopicality(typeof m.topicality === "number" ? m.topicality : undefined),
    featured: Boolean(m.featured),
    status: "open",
    createdAt: typeof m.createdAt === "string" ? m.createdAt : now,
    createdBy: typeof m.createdBy === "string" ? m.createdBy : "editorial-batch",
  });
  if (!candidate.success) {
    rejected.push({ slug, reason: candidate.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    continue;
  }
  const closes = new Date(candidate.data.closesAt).getTime();
  if (!Number.isFinite(closes) || closes < Date.now() + 3600_000) {
    rejected.push({ slug, reason: "closesAt is in the past or under an hour away" });
    continue;
  }
  file.markets.push(candidate.data);
  existingSlugs.add(slug);
  compareAgainst.push(candidate.data);
  added.push(slug);
}

file.updatedAt = now;
if (note) file.lastUpdateNote = note;

fs.writeFileSync("data/people.json", JSON.stringify({ people: peopleFile.people }, null, 2) + "\n");
fs.writeFileSync("data/markets.json", JSON.stringify(file, null, 2) + "\n");

console.log(`added ${added.length} markets, ${addedPeople} people; rejected ${rejected.length}`);
for (const r of rejected) console.log(`  rejected ${r.slug}: ${r.reason}`);
// print what was let through on the writer's word, so the run's own log carries
// the reasoning a reviewer would otherwise have to reconstruct
for (const a of acknowledged) console.log(`  cleared as different — ${a}`);
console.log(`total markets now: ${file.markets.length}`);
