/**
 * Merges a batch of generated markets into data/markets.json.
 *
 *   npx tsx scripts/merge-markets.ts batch.json [--note "..."]
 *
 * The batch file is `{ "markets": [...], "newPeople": [...] }` or a bare array.
 * Each market is normalised, defaulted, de-duplicated against what already
 * exists (by slug and by title overlap) and appended. People referenced under
 * `newPeople` are added to data/people.json so `npm run people:fetch` can
 * pull their photos.
 */
import fs from "node:fs";
import { MarketsFileSchema, PeopleFileSchema, MarketContentSchema } from "../src/lib/content";

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

/** word-overlap similarity, used to catch re-phrased duplicates */
function words(s: string): Set<string> {
  return new Set(
    s
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}
function similar(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}

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
const titles = file.markets.map((m) => m.title);

const added: string[] = [];
const rejected: { slug: string; reason: string }[] = [];

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
  const title = String(m.title ?? "");
  const dup = titles.find((t) => similar(t, title) >= 0.62);
  if (dup) {
    rejected.push({ slug, reason: `too similar to "${dup.slice(0, 60)}"` });
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
  titles.push(title);
  added.push(slug);
}

file.updatedAt = now;
if (note) file.lastUpdateNote = note;

fs.writeFileSync("data/people.json", JSON.stringify({ people: peopleFile.people }, null, 2) + "\n");
fs.writeFileSync("data/markets.json", JSON.stringify(file, null, 2) + "\n");

console.log(`added ${added.length} markets, ${addedPeople} people; rejected ${rejected.length}`);
for (const r of rejected) console.log(`  rejected ${r.slug}: ${r.reason}`);
console.log(`total markets now: ${file.markets.length}`);
