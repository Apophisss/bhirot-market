/**
 * The duplicate review that gate 6 of the question pipeline asks for.
 *
 *   npm run markets:duplicates                    every open pair worth a second look
 *   npm run markets:duplicates -- --batch b.json  a pending batch vs the board, and vs itself
 *   npm run markets:duplicates -- --slug <slug>   the open questions nearest to one market
 *   npm run markets:duplicates -- --full          print the resolution criteria in full
 *   npm run markets:duplicates -- --strict        exit 1 if any pair is at merge's blocking bar
 *
 * `markets:audit` counts the pairs; this prints them side by side with their
 * deadlines, their prices and their resolutionCriteria, because that is what the
 * question actually turns on. Two questions are the same when the same event
 * resolves both — which no word overlap can see, and a reader can.
 */
import fs from "node:fs";
import { MarketsFileSchema } from "../src/lib/content";
import { duplicateRisk, REASON_TEXT, type Comparable, type DuplicateRisk } from "../src/lib/similarity";

process.stdout.on("error", () => {});

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const full = args.includes("--full");
const strict = args.includes("--strict");
const batchPath = flag("batch");
const onlySlug = flag("slug");

const file = MarketsFileSchema.parse(JSON.parse(fs.readFileSync("data/markets.json", "utf8")));
const open: Comparable[] = file.markets.filter((m) => m.status === "open");
const priced = new Map(file.markets.map((m) => [m.slug, m] as const));

/** Batch entries are not schema-valid yet; take the four fields the check reads. */
function fromBatch(path: string): Comparable[] {
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw.markets ?? []);
  return items.map((m, i) => ({
    slug: String(m.slug ?? `(batch #${i + 1})`),
    title: String(m.title ?? ""),
    resolutionCriteria: String(m.resolutionCriteria ?? ""),
    closesAt: String(m.closesAt ?? ""),
    sources: Array.isArray(m.sources) ? (m.sources as { url: string }[]) : [],
  }));
}

const clip = (s: string, n: number) => (full || s.length <= n ? s : `${s.slice(0, n)}…`);
const when = (iso: string) => (iso || "").slice(0, 16).replace("T", " ");

function describe(m: Comparable): string[] {
  const stored = priced.get(m.slug);
  const price = stored ? ` p=${Math.round(stored.initialProbability * 100)}%` : "";
  return [
    `  ${m.slug}  ✕ ${when(m.closesAt)}${price}`,
    `    ${m.title}`,
    `    ${clip(m.resolutionCriteria, 240)}`,
  ];
}

function printPair(a: Comparable, b: Comparable, r: DuplicateRisk) {
  const mark = r.level === "block" ? "BLOCK" : "REVIEW";
  console.log(
    `\n${mark}  title ${r.title.toFixed(2)} · criteria ${r.criteria.toFixed(2)} · sources ${r.sources.toFixed(2)} · ` +
      `${Number.isFinite(r.gapHours) ? `${Math.round(r.gapHours)}h apart` : "no deadline"}`,
  );
  for (const reason of r.reasons) console.log(`       ${REASON_TEXT[reason]}`);
  console.log(describe(a).join("\n"));
  console.log(describe(b).join("\n"));
}

let blocking = 0;
let reviews = 0;
function report(a: Comparable, b: Comparable) {
  const r = duplicateRisk(a, b);
  if (r.level === "clear") return;
  if (r.level === "block") blocking++;
  else reviews++;
  printPair(a, b, r);
}

if (batchPath) {
  const batch = fromBatch(batchPath);
  console.log(`checking ${batch.length} pending question(s) against ${open.length} open market(s)`);
  for (const item of batch) {
    for (const m of open) report(item, m);
  }
  // a batch can also duplicate itself: two questions written in the same run off
  // the same story, which nothing catches once they are both already merged
  for (let i = 0; i < batch.length; i++) {
    for (let j = i + 1; j < batch.length; j++) report(batch[i], batch[j]);
  }
} else if (onlySlug) {
  const target = open.find((m) => m.slug === onlySlug);
  if (!target) {
    console.error(`no open market with slug "${onlySlug}"`);
    process.exit(1);
  }
  console.log(`neighbours of ${onlySlug} among ${open.length - 1} other open market(s)`);
  for (const m of open) if (m.slug !== target.slug) report(target, m);
} else {
  console.log(`checking every pair among ${open.length} open market(s)`);
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) report(open[i], open[j]);
  }
}

console.log(`\n${blocking} pair(s) at the blocking bar, ${reviews} pair(s) to read.`);
if (!blocking && !reviews) console.log("nothing looks like anything else on the board.");
else console.log("a pair listed here is not a duplicate yet — read both criteria and decide which event resolves each one.");
if (strict && blocking) process.exit(1);
