/**
 * Tests for the sell-side selection the trade panel runs on (`src/lib/sell.ts`).
 *
 * The engine's own money path is covered by `test-trade.ts`; what is covered here
 * is the step before it — WHICH holding a sale is about. Getting that wrong is
 * what made a holder see "מניות למכירה (יש לך 0)" and a dead button directly
 * above a position box listing their real shares.
 *
 * Run: npm run test:sell   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import { hasAnyShares, otherSide, sellPrefill, sellSide, sharesOn } from "../src/lib/sell";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}`);
    console.error(`      ${(err as Error).message.split("\n")[0]}`);
  }
}

const yesOnly = { yesShares: 85.44215852130799, noShares: 0 };
const noOnly = { yesShares: 0, noShares: 69.11179501619613 };
const both = { yesShares: 12.5, noShares: 40 };
const empty = { yesShares: 0, noShares: 0 };

test("otherSide flips", () => {
  assert.equal(otherSide("YES"), "NO");
  assert.equal(otherSide("NO"), "YES");
});

test("sharesOn reads the side, and treats nothing as nothing", () => {
  assert.equal(sharesOn(yesOnly, "YES"), yesOnly.yesShares);
  assert.equal(sharesOn(yesOnly, "NO"), 0);
  assert.equal(sharesOn(null, "YES"), 0);
  assert.equal(sharesOn(undefined, "NO"), 0);
  assert.equal(sharesOn({ yesShares: NaN, noShares: -3 }, "YES"), 0, "NaN is not a holding");
  assert.equal(sharesOn({ yesShares: NaN, noShares: -3 }, "NO"), 0, "a negative is not a holding");
});

test("hasAnyShares", () => {
  assert.equal(hasAnyShares(yesOnly), true);
  assert.equal(hasAnyShares(noOnly), true);
  assert.equal(hasAnyShares(empty), false);
  assert.equal(hasAnyShares(null), false);
});

test("the bug: a NO holder opening the sell tab lands on NO, not on the כן default", () => {
  // this is the reported failure — the panel defaulted to YES, reported "יש לך 0"
  // and disabled the button while the position box showed 69.1 NO shares
  assert.equal(sellSide(noOnly, "YES"), "NO");
  assert.equal(sellPrefill(noOnly, sellSide(noOnly, "YES")), "69.1117");
});

test("a held side is never taken away from the trader", () => {
  assert.equal(sellSide(yesOnly, "YES"), "YES");
  assert.equal(sellSide(noOnly, "NO"), "NO");
  // holding both sides means the deep link / current selection decides
  assert.equal(sellSide(both, "YES"), "YES");
  assert.equal(sellSide(both, "NO"), "NO");
});

test("with nothing held the preference stands (nothing to flip to)", () => {
  assert.equal(sellSide(empty, "YES"), "YES");
  assert.equal(sellSide(empty, "NO"), "NO");
  assert.equal(sellSide(null, "NO"), "NO");
});

test("the prefill is the whole holding, truncated — never above it", () => {
  const filled = Number(sellPrefill(yesOnly, "YES"));
  assert.ok(filled <= yesOnly.yesShares, `prefill ${filled} must not exceed the holding`);
  assert.ok(yesOnly.yesShares - filled < 1e-4, "and must leave no more than dust behind");
  assert.equal(sellPrefill(yesOnly, "NO"), "", "an empty side prefills to an empty box");
  assert.equal(sellPrefill(null, "YES"), "");
  assert.equal(sellPrefill({ yesShares: 40, noShares: 0 }, "YES"), "40", "a round holding stays round");
});

test("the prefill never reaches the panel in exponent notation", () => {
  // <input type=number> and Number() both cope, but "8.5e+1" in the box reads as broken
  for (const shares of [0.0001, 1234.5678, 987654.321]) {
    const s = sellPrefill({ yesShares: shares, noShares: 0 }, "YES");
    assert.ok(!/e/i.test(s), `prefill ${s} should be plain decimal`);
    assert.ok(Number(s) <= shares);
  }
});

if (failures.length) {
  console.error(`\nsell: ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`sell: ${passed} tests passed`);
