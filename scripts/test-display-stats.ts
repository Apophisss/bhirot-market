/**
 * Property-checks the display-only homepage numbers (src/lib/display-stats.ts).
 *
 * Two promises are worth a test in a repo with no test runner:
 *   1. the advertised question count is never *smaller* than the real board;
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
  DISPLAY_UPDATE_MIN_AGE_MS,
  DISPLAY_UPDATE_PERIOD_MS,
  displayOpenCount,
  displayUpdatedAt,
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
