/**
 * Property-checks the display-only homepage numbers (src/lib/display-stats.ts).
 *
 * Three promises are worth a test in a repo with no test runner:
 *   1. every advertised headline is never *smaller* than the real number behind
 *      it, and the cumulative ones (traders, volume, resolutions) never shrink
 *      while the real number grows;
 *   2. the "updated" moment the site shows is always inside the last hour,
 *      and never walks backwards as the clock advances.
 *
 *   npm run test:display                    # 200,000 random moments
 *   npm run test:display -- --cases=1000000
 *
 * Exits 1 on the first violation and prints the failing case.
 */
import {
  DISPLAY_OPEN_DRIFT,
  DISPLAY_OPEN_MULTIPLIER,
  DISPLAY_RESOLVED_MULTIPLIER,
  DISPLAY_UPDATE_MIN_AGE_MS,
  DISPLAY_UPDATE_PERIOD_MS,
  DISPLAY_USERS_FLOOR,
  DISPLAY_USERS_MULTIPLIER,
  DISPLAY_VOLUME_MULTIPLIER,
  displayOpenCount,
  displayResolvedCount,
  displayUpdatedAt,
  displayUserCount,
  displayVolume,
} from "../src/lib/display-stats";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const arg = process.argv.find((a) => a.startsWith("--cases="));
const CASES = arg ? Number(arg.slice("--cases=".length)) : 200_000;
const START = Date.UTC(2026, 8, 5);

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

// ---- displayOpenCount -------------------------------------------------------

check("empty board stays empty", displayOpenCount(0) === 0);
check("a negative count is not inflated", displayOpenCount(-5) === 0);

for (let i = 0; i < CASES; i++) {
  const now = START + Math.floor(Math.random() * 400 * DAY);
  const real = 1 + Math.floor(Math.random() * 900);
  const shown = displayOpenCount(real, now);
  check("never undersells the real board", shown >= real, { real, shown, now });
  check("stays under the advertised ceiling", shown <= Math.round(real * DISPLAY_OPEN_MULTIPLIER) + DISPLAY_OPEN_DRIFT, {
    real,
    shown,
  });
  check("deterministic for the same moment", shown === displayOpenCount(real, now), { real, now });
  const sameHour = now - (now % HOUR) + Math.floor(Math.random() * HOUR);
  check("constant inside one hour", displayOpenCount(real, sameHour) === displayOpenCount(real, now - (now % HOUR)), {
    real,
    now,
  });
}

// the drift has to actually move, or the "alive board" is a constant
const hours = new Set<number>();
for (let h = 0; h < 400; h++) hours.add(displayOpenCount(344, START + h * HOUR));
check("the count drifts across hours", hours.size > 5, { distinct: hours.size });

// ---- the cumulative headlines: traders, volume, resolutions -----------------

// a headline that can go backwards between two page loads reads as a bug, so these
// three are pure functions of the real number — no clock, no wobble
const CUMULATIVE = [
  {
    name: "traders",
    fn: displayUserCount,
    // the crowd on /leaderboard is countable on screen; the headline must cover it
    floor: DISPLAY_USERS_FLOOR,
    mult: DISPLAY_USERS_MULTIPLIER,
  },
  { name: "volume", fn: displayVolume, floor: 0, mult: DISPLAY_VOLUME_MULTIPLIER },
  { name: "resolved", fn: displayResolvedCount, floor: 0, mult: DISPLAY_RESOLVED_MULTIPLIER },
] as const;

for (const { name, fn, floor, mult } of CUMULATIVE) {
  check(`${name}: an empty board shows the floor`, fn(0) === floor, { shown: fn(0), floor });
  check(`${name}: a negative number is not inflated`, fn(-5) === floor, { shown: fn(-5), floor });
  check(`${name}: a broken number is not inflated`, fn(NaN) === floor && fn(Infinity) === floor);

  // a real number under a unit used to round *below itself* (₪0.02 x 3.4 -> ₪0), and
  // only a 1-in-350,000 draw below caught it. The range that can round down is small
  // and known, so it is checked outright rather than left to the dice.
  for (let cents = 1; cents <= 100; cents++) {
    const real = cents / 100;
    check(`${name}: a sub-unit number is never rounded below itself`, fn(real) >= real, { real, shown: fn(real) });
  }

  let prev = fn(0);
  for (let i = 0; i < CASES; i++) {
    const real = Math.round(Math.random() * 5_000_000) / 100; // covers both counts and shekels
    const shown = fn(real);
    check(`${name}: never undersells the real number`, shown >= real, { real, shown });
    // the ceiling is the multiplier, except where the number itself is the higher of
    // the two — the inflators never go below the truth, so neither does the ceiling
    const ceiling = floor + Math.max(Math.round(real * mult), Math.ceil(real));
    check(`${name}: stays under the advertised ceiling`, shown <= ceiling, { real, shown, ceiling });
    check(`${name}: deterministic`, shown === fn(real), { real, shown });
  }
  // monotone in the real number, which only ever grows -> the headline never walks backwards
  for (let real = 0; real <= 20_000; real += 7) {
    const shown = fn(real);
    check(`${name}: never shrinks as the real number grows`, shown >= prev, { real, shown, prev });
    prev = shown;
  }
}

// the same real board rendered at two different moments must read identically
check("traders do not depend on the clock", displayUserCount(37) === displayUserCount(37));
check("the fabricated crowd is inside the trader headline", displayUserCount(0) >= DISPLAY_USERS_FLOOR);

// ---- displayUpdatedAt -------------------------------------------------------

const REAL_CASES = [
  ["no run at all", null],
  ["a run from last week", -7 * DAY],
  ["a run from six hours ago", -6 * HOUR],
  ["a run from ten minutes ago", -10 * MINUTE],
  ["a run timestamped in the future", 3 * HOUR],
] as const;

for (let i = 0; i < CASES; i++) {
  const now = START + Math.floor(Math.random() * 400 * DAY);
  for (const [label, offset] of REAL_CASES) {
    const real = offset === null ? null : now + offset;
    const ts = displayUpdatedAt(real, now);
    const age = now - ts;
    check(`${label}: inside the last hour`, age > 0 && age < HOUR, { label, now, ts, ageMin: age / MINUTE });
    check(`${label}: not younger than the floor`, age >= DISPLAY_UPDATE_MIN_AGE_MS, { label, now, ageMin: age / MINUTE });
    check(`${label}: deterministic`, ts === displayUpdatedAt(real, now), { label, now });
  }
  // a genuinely fresh run is shown as-is rather than replaced by the fabricated anchor
  const fresh = now - 3 * MINUTE;
  const shown = displayUpdatedAt(fresh, now);
  check("a fresher real run wins", shown >= fresh - DISPLAY_UPDATE_PERIOD_MS && shown <= now, { now, fresh, shown });
}

// the badge must never age *backwards* while a visitor sits on the page
let prev = displayUpdatedAt(null, START);
for (let m = 1; m <= 60 * 24 * 30; m++) {
  const now = START + m * MINUTE;
  const ts = displayUpdatedAt(null, now);
  check("the update moment never walks backwards", ts >= prev, { now, ts, prev });
  prev = ts;
}

// and it must refresh regularly, or "updated recently" becomes a lie by staleness
const anchors = new Set<number>();
for (let m = 0; m < 60 * 24; m++) anchors.add(displayUpdatedAt(null, START + m * MINUTE));
check("a new update lands at least hourly", anchors.size >= 24, { distinct: anchors.size });

if (failures) {
  console.error(`\n${failures} property violation(s)`);
  process.exit(1);
}
console.log(`✓ display-stats: ${CASES.toLocaleString("en-US")} moments, all properties hold`);
