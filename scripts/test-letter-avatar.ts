/**
 * Checks the avatar letters (src/lib/letter-avatar.ts).
 *
 * Three promises worth a test in a repo with no test runner:
 *   1. every seed yields exactly one letter of A–Z, and the same one twice
 *      (the server renders the feed, the browser keeps appending to it — a
 *      mismatch is a hydration error);
 *   2. the draw follows the weight table, so the column reads like names and
 *      not like a uniform A–Z sprinkle;
 *   3. a rare letter stays rare, and consecutive ids ("t:1041", "t:1042") do
 *      not land on the same letter — a column of identical circles is exactly
 *      what gives a fabricated feed away.
 *
 *   npm run test:letters
 *   npm run test:letters -- --cases=1000000
 *
 * Exits 1 on the first violation and prints the failing case.
 */
import { LETTER_TABLE, hashSeed, letterFor, letterForHash } from "../src/lib/letter-avatar";

const arg = process.argv.find((a) => a.startsWith("--cases="));
const CASES = arg ? Number(arg.slice("--cases=".length)) : 200_000;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) return;
  failures++;
  console.error(`✗ ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  if (failures > 10) {
    console.error("aborting after 10 failures");
    process.exit(1);
  }
}

// ---- shape ------------------------------------------------------------------

const counts = new Map<string, number>();
for (let i = 0; i < CASES; i++) {
  const seed = `t:${Math.random().toString(36).slice(2)}`;
  const letter = letterFor(seed);
  if (!/^[A-Z]$/.test(letter)) check("one capital letter", false, { seed, letter });
  if (letterFor(seed) !== letter) check("stable for the same seed", false, { seed, letter });
  counts.set(letter, (counts.get(letter) ?? 0) + 1);
}

check("hash is stable across calls", hashSeed("f:12345") === hashSeed("f:12345"));
check("different seeds do not collapse to one letter", counts.size >= 20, { distinct: counts.size });

// the extremes of the hash range must still land inside the table
check("hash 0 has a letter", /^[A-Z]$/.test(letterForHash(0)));
check("hash 0xffffffff has a letter", /^[A-Z]$/.test(letterForHash(0xffff_ffff)));
check("a negative hash has a letter", /^[A-Z]$/.test(letterForHash(-1)));

// ---- distribution -----------------------------------------------------------

const { LETTER_WEIGHTS, TOTAL_WEIGHT } = LETTER_TABLE;
for (const [letter, weight] of Object.entries(LETTER_WEIGHTS)) {
  const expected = weight / TOTAL_WEIGHT;
  const seen = (counts.get(letter) ?? 0) / CASES;
  // generous band: this guards the wiring, not the sampler's fourth decimal
  check(`${letter} is drawn at about its weight`, Math.abs(seen - expected) < 0.01 + expected * 0.1, {
    letter,
    expected: +expected.toFixed(4),
    seen: +seen.toFixed(4),
  });
}

// consecutive seeds must spread: this is what a weak hash gets wrong
const run = Array.from({ length: 60 }, (_, i) => letterFor(`t:${100_000 + i}`));
const distinctRun = new Set(run).size;
check("consecutive ids spread over letters", distinctRun >= 12, { run: run.join(""), distinctRun });
let longestRepeat = 1;
for (let i = 1, cur = 1; i < run.length; i++) {
  cur = run[i] === run[i - 1] ? cur + 1 : 1;
  longestRepeat = Math.max(longestRepeat, cur);
}
check("no run of identical circles", longestRepeat <= 3, { longestRepeat, run: run.join("") });

const rare = ["Q", "X", "W", "F", "J"].reduce((n, l) => n + (counts.get(l) ?? 0), 0) / CASES;
check("rare initials stay rare", rare < 0.02, { rare: +rare.toFixed(4) });

const common = ["A", "M", "Y", "N", "S"].reduce((n, l) => n + (counts.get(l) ?? 0), 0) / CASES;
check("common initials carry the feed", common > 0.35, { common: +common.toFixed(4) });

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`✓ letter avatars: ${CASES.toLocaleString()} seeds, ${counts.size} distinct letters`);
