/**
 * Editorial audit of data/markets.json — the checks `markets:validate` (a
 * schema check) deliberately does not make: is the *board* healthy?
 *
 *   npx tsx scripts/audit-markets.ts            full report
 *   npx tsx scripts/audit-markets.ts --new 7    horizon mix over markets created in the last 7 days
 *   npx tsx scripts/audit-markets.ts --strict   exit 1 if anything is an error
 *
 * Errors (ERR) must be fixed before committing; warnings (WARN) are judgement calls
 * the editor should look at and may knowingly accept.
 */
import fs from "node:fs";
import { MarketsFileSchema, type MarketContent } from "../src/lib/content";
import { verdict } from "../src/lib/elasticity";
import { similar, DUPLICATE_THRESHOLD } from "../src/lib/similarity";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** merge-markets.ts refuses a new question whose title overlaps an existing one this much. */

/** Outlets AGENT.md accepts as decisive sources, plus the reference sites the seed markets cite. */
const KNOWN_SOURCES = new Set([
  "ynet.co.il", "haaretz.co.il", "kan.org.il", "n12.co.il", "mako.co.il", "13tv.co.il", "reshet.tv",
  "now14.co.il", "c14.co.il", "maariv.co.il", "israelhayom.co.il", "walla.co.il", "news.walla.co.il",
  "timesofisrael.com", "jpost.com", "globes.co.il", "makorrishon.co.il", "kikar.co.il", "srugim.co.il",
  "i24news.tv", "calcalist.co.il", "themarker.com", "zman.co.il", "inn.co.il",
  // aggregators, institutes and official publishers
  "skarim.org", "idi.org.il", "knesset.gov.il", "gov.il", "bechirot.gov.il", "court.gov.il", "elections.gov.il",
]);
/** Fine as background, never decisive on its own. */
const WEAK_SOURCES = new Set(["en.wikipedia.org", "he.wikipedia.org", "x.com", "twitter.com", "facebook.com", "t.me"]);
/** resolutionCriteria has to say what happens when the event simply does not occur. */
const NO_CASE = /["״'׳]לא["״'׳]|אחרת|לא\s+(?:יתפרסם|יפורסם|יוגש|יוכרז|יתקיים|יתרחש|יקרה|תוגש|תפורסם)|אינ(?:ו|ה|ם|ן)\s+נחשב|לא\s+נחשב/;
const DEADLINE_WORDS = ["עד ", "לפני ", "מחר", "היום", "הערב", "הקרוב", "הקרובה", "הבא", "הבאה", "מוצאי", "בתוך "];

// piping into `head` closes stdout early; that is not an error worth a stack trace
process.stdout.on("error", () => {});

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const strict = args.includes("--strict");
const newWindowDays = Number(flag("new", "7"));

const file = MarketsFileSchema.parse(JSON.parse(fs.readFileSync("data/markets.json", "utf8")));
const now = Date.now();
const open = file.markets.filter((m) => m.status === "open");

let errors = 0;
let warnings = 0;
function err(msg: string) {
  errors++;
  console.log(`  ERR  ${msg}`);
}
function warn(msg: string) {
  warnings++;
  console.log(`  WARN ${msg}`);
}
const ok = (msg: string) => console.log(`  ok   ${msg}`);
const info = (msg: string) => console.log(`  · ${msg}`);
const section = (title: string) => console.log(`\n${title}`);

const hoursOut = (m: MarketContent) => (new Date(m.closesAt).getTime() - now) / HOUR;
const isShort = (m: MarketContent) => hoursOut(m) <= 72;
const hosts = (m: MarketContent) => m.sources.map((s) => new URL(s.url).hostname.replace(/^www\./, ""));


console.log(`board audit — ${file.markets.length} markets (${open.length} open), updated ${file.updatedAt}`);

// ── resolution debt ────────────────────────────────────────────────────────
section("resolution debt");
const overdue = open.filter((m) => hoursOut(m) < 0).sort((a, b) => hoursOut(a) - hoursOut(b));
for (const m of overdue) {
  const h = -hoursOut(m);
  const line = `${m.slug} closed ${h >= 24 ? `${Math.floor(h / 24)}d` : `${Math.floor(h)}h`} ago and is still open — resolve it`;
  if (h >= 24) err(line);
  else warn(line);
}
const closingSoon = open.filter((m) => hoursOut(m) >= 0 && hoursOut(m) <= 24);
if (closingSoon.length) info(`${closingSoon.length} market(s) close within 24h — expect to resolve them next run: ${closingSoon.map((m) => m.slug).join(", ")}`);
if (!overdue.length && !closingSoon.length) ok("nothing overdue, nothing closing in the next 24h");

// ── horizon mix ────────────────────────────────────────────────────────────
section("horizon mix (AGENT.md: at least a third of each batch closes within 24–72h)");
const buckets: Record<string, number> = { "≤24h": 0, "24–72h": 0, "3–7d": 0, "1–6w": 0, ">6w": 0 };
for (const m of open) {
  const h = hoursOut(m);
  if (h < 0) continue;
  const key = h <= 24 ? "≤24h" : h <= 72 ? "24–72h" : h <= 7 * 24 ? "3–7d" : h <= 42 * 24 ? "1–6w" : ">6w";
  buckets[key]++;
}
info(Object.entries(buckets).map(([k, v]) => `${k}: ${v}`).join("   "));
const recent = file.markets.filter((m) => now - new Date(m.createdAt).getTime() <= newWindowDays * DAY);
if (!recent.length) {
  warn(`no market was created in the last ${newWindowDays} days — the board is going stale`);
} else {
  const short = recent.filter(isShort).length;
  const share = short / recent.length;
  const line = `${short}/${recent.length} markets created in the last ${newWindowDays}d close within 72h (${Math.round(share * 100)}%)`;
  if (share >= 1 / 3) ok(line);
  else warn(`${line} — the target is a third; the board needs same-day questions`);
}

// ── probability discipline ─────────────────────────────────────────────────
section("probability discipline");
const hist = new Map<number, number>();
for (const m of open) {
  const band = Math.min(90, Math.floor(m.initialProbability * 10) * 10);
  hist.set(band, (hist.get(band) ?? 0) + 1);
}
info([...hist.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b}-${b + 10}%:${n}`).join("  "));
const lazy = open.filter((m) => m.initialProbability >= 0.45 && m.initialProbability <= 0.55);
if (open.length && lazy.length / open.length > 0.25) {
  warn(`${lazy.length}/${open.length} open markets sit in 45–55% — coin-flip pricing usually means the research stopped early`);
} else {
  ok(`${lazy.length}/${open.length} open markets in the 45–55% band`);
}
for (const m of open) {
  if (m.initialProbability < 0.05 || m.initialProbability > 0.95) {
    warn(`${m.slug}: ${Math.round(m.initialProbability * 100)}% is outside the 5–95% band AGENT.md asks for — a near-certain question is not worth trading`);
  }
}
const boldShort = open.filter((m) => hoursOut(m) > 0 && isShort(m) && m.initialProbability > 0.5);
for (const m of boldShort) {
  warn(`${m.slug}: ${Math.round(m.initialProbability * 100)}% on a ${Math.round(hoursOut(m))}h question — in a 72h window most things do not happen; price above 50% only for something already scheduled`);
}
if (!boldShort.length && open.some(isShort)) ok("short-horizon markets are priced below 50%, as the base rate suggests");

// ── duplicate risk ─────────────────────────────────────────────────────────
section(`duplicate risk (merge-markets.ts rejects a new title at ${DUPLICATE_THRESHOLD}; titles only — read the criteria)`);
const pairs: { a: string; b: string; s: number }[] = [];
for (let i = 0; i < open.length; i++) {
  for (let j = i + 1; j < open.length; j++) {
    const s = similar(open[i].title, open[j].title);
    if (s >= 0.65) pairs.push({ a: open[i].slug, b: open[j].slug, s });
  }
}
pairs.sort((x, y) => y.s - x.s);
const blocking = pairs.filter((p) => p.s >= DUPLICATE_THRESHOLD);
for (const p of blocking.slice(0, 15)) {
  warn(`${p.s.toFixed(2)} title overlap: ${p.a} ↔ ${p.b} — check they really ask different things, and expect merge to reject anything close to them`);
}
if (blocking.length > 15) info(`...and ${blocking.length - 15} more pairs above ${DUPLICATE_THRESHOLD}`);
const watch = pairs.length - blocking.length;
if (watch) info(`${watch} further pair(s) between 0.65 and ${DUPLICATE_THRESHOLD} — near the rejection line`);
if (!pairs.length) ok("no open pair overlaps by half its words");

// ── sources ────────────────────────────────────────────────────────────────
section("sources");
const urlOwners = new Map<string, string[]>();
for (const m of open) {
  if (!m.sources.length) {
    err(`${m.slug}: no sources — every question needs the reporting it came from`);
    continue;
  }
  const h = hosts(m);
  if (h.every((x) => WEAK_SOURCES.has(x))) {
    warn(`${m.slug}: only weak sources (${h.join(", ")}) — add reporting a resolution can lean on`);
  }
  for (const x of new Set(h)) {
    if (!KNOWN_SOURCES.has(x) && !WEAK_SOURCES.has(x)) {
      warn(`${m.slug}: unfamiliar source domain ${x} — confirm the outlet is one a resolution can cite`);
    }
  }
  for (const s of m.sources) {
    if (!s.url.startsWith("https://")) warn(`${m.slug}: non-https source ${s.url}`);
    urlOwners.set(s.url, [...(urlOwners.get(s.url) ?? []), m.slug]);
  }
}
// Several questions off one big story is fine; two questions off the *same set*
// of articles usually means one of them has nothing new to say.
const bySourceSet = new Map<string, string[]>();
for (const m of open) {
  if (m.sources.length < 2) continue;
  const key = [...m.sources.map((s) => s.url)].sort().join("|");
  bySourceSet.set(key, [...(bySourceSet.get(key) ?? []), m.slug]);
}
for (const [, slugs] of bySourceSet) {
  if (slugs.length > 1) warn(`${slugs.join(" and ")} cite an identical set of articles — one of them is probably not a new question`);
}
const shared = [...urlOwners.values()].filter((v) => v.length > 1).length;
info(`${urlOwners.size} distinct source URLs across ${open.length} open markets (${shared} URL(s) cited by more than one market)`);

// ── wording that has to survive a dispute ──────────────────────────────────
section("resolution criteria");
let criteriaFlags = 0;
for (const m of open) {
  if (m.resolutionCriteria.length < 120) {
    warn(`${m.slug}: resolutionCriteria is ${m.resolutionCriteria.length} chars — too short to settle an argument`);
    criteriaFlags++;
  }
  if (!NO_CASE.test(m.resolutionCriteria)) {
    warn(`${m.slug}: resolutionCriteria never says what happens if the event simply does not occur`);
    criteriaFlags++;
  }
  if (!m.title.startsWith("האם")) {
    warn(`${m.slug}: title should open with "האם"`);
    criteriaFlags++;
  }
  if (!DEADLINE_WORDS.some((w) => m.title.includes(w)) && !/\d/.test(m.title)) {
    warn(`${m.slug}: title carries no deadline — the closing date has to be readable from the question itself`);
    criteriaFlags++;
  }
}
if (!criteriaFlags) ok(`all ${open.length} open questions are worded to settle themselves`);

// ── elasticity ─────────────────────────────────────────────────────────────
section("elasticity (npx tsx scripts/liquidity.ts --audit for the detail)");
const off = open.filter((m) => !verdict(m.initialProbability, m.liquidity).ok);
if (off.length) warn(`${off.length}/${open.length} open markets are outside the healthy liquidity window: ${off.map((m) => m.slug).join(", ")}`);
else ok(`all ${open.length} open markets sit in the healthy liquidity window`);

// ── calibration ────────────────────────────────────────────────────────────
// The feedback loop for future pricing: were the opening probabilities any
// good? Brier score is the mean squared error of the opening price against the
// outcome — 0 is perfect, 0.25 is what you get by always saying 50%.
section("calibration (how well did past opening prices predict?)");
const scored = file.markets.filter((m) => m.status === "resolved" && (m.resolution === "YES" || m.resolution === "NO"));
if (!scored.length) {
  info("no resolved markets yet — nothing to score");
} else {
  const outcome = (m: MarketContent) => (m.resolution === "YES" ? 1 : 0);
  const brier = scored.reduce((sum, m) => sum + (m.initialProbability - outcome(m)) ** 2, 0) / scored.length;
  const meanP = scored.reduce((sum, m) => sum + m.initialProbability, 0) / scored.length;
  const rateYes = scored.reduce((sum, m) => sum + outcome(m), 0) / scored.length;
  info(`${scored.length} resolved market(s) · Brier ${brier.toFixed(3)} (0.250 = always saying 50%)`);
  if (brier > 0.25) warn(`Brier ${brier.toFixed(3)} is worse than a coin flip — the opening prices are adding noise, not information`);
  else ok(`Brier ${brier.toFixed(3)} beats the coin flip`);
  const bias = meanP - rateYes;
  const biasLine = `average opening price ${Math.round(meanP * 100)}% vs ${Math.round(rateYes * 100)}% actually resolving YES`;
  if (Math.abs(bias) > 0.1) {
    warn(`${biasLine} — ${bias > 0 ? "systematically optimistic: events are being priced as more likely than they are" : "systematically pessimistic: too many long shots are landing"}`);
  } else {
    ok(biasLine);
  }
  // bucketed reliability: does "30%" actually happen about 30% of the time?
  const bands = [0, 0.2, 0.4, 0.6, 0.8, 1];
  for (let i = 0; i < bands.length - 1; i++) {
    const inBand = scored.filter((m) => m.initialProbability >= bands[i] && m.initialProbability < (i === bands.length - 2 ? 1.01 : bands[i + 1]));
    if (!inBand.length) continue;
    const actual = inBand.reduce((sum, m) => sum + outcome(m), 0) / inBand.length;
    info(`  priced ${bands[i] * 100}–${bands[i + 1] * 100}% (n=${inBand.length}) → ${Math.round(actual * 100)}% resolved YES`);
  }
  const shortScored = scored.filter((m) => (new Date(m.closesAt).getTime() - new Date(m.createdAt).getTime()) / HOUR <= 72);
  if (shortScored.length >= 3) {
    const shortYes = shortScored.reduce((sum, m) => sum + outcome(m), 0) / shortScored.length;
    info(`  questions written with a ≤72h window (n=${shortScored.length}) → ${Math.round(shortYes * 100)}% resolved YES`);
    if (shortYes > 0.5) warn("more than half of the short-window questions resolve YES — they are being written too easy; raise the bar or shorten the window");
  }
}

// ── spread ─────────────────────────────────────────────────────────────────
section("spread");
const byCategory = new Map<string, number>();
for (const m of open) byCategory.set(m.category, (byCategory.get(m.category) ?? 0) + 1);
const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
info(sorted.map(([c, n]) => `${c}:${n}`).join("  "));
if (sorted.length && sorted[0][1] / open.length > 0.4) {
  warn(`${sorted[0][0]} is ${Math.round((sorted[0][1] / open.length) * 100)}% of the open board — put the next batch elsewhere`);
}
const featured = open.filter((m) => m.featured).length;
if (featured === 0) warn("no open market is featured — the homepage has nothing to lead with");
else if (featured > 6) warn(`${featured} featured markets — featuring everything features nothing`);

console.log(`\n${errors} error(s), ${warnings} warning(s).`);
if (strict && errors) process.exit(1);
