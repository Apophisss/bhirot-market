/**
 * Checks the points formatter (src/lib/format.ts).
 *
 * The engine works in real numbers — a sale, a payout and a profit/loss line all
 * land on hundredths — and the screen does not. Every amount a player reads is a
 * whole number of points, because two decimal places of a play-money score are
 * not information: they turned the header into "שווי 10,000.05 נק׳" and gave
 * twenty-two open positions a column of "0.00 נק׳" to scan past.
 *
 * So the formatter has three promises worth a test:
 *   1. what is printed is the amount ROUNDED, never truncated — a score is never
 *      quietly shaved, in either direction;
 *   2. nothing that rounds to zero wears a sign, and nothing that wears a sign is
 *      painted as anything other than what `pnlSign` says it is;
 *   3. `compact` still gives the short K/M overview volume needs.
 *
 * The unit itself is asserted too: the site says points, not ₪ (see the note on
 * `money()`), and a stray shekel sign is exactly the kind of thing that survives
 * a copy sweep unnoticed.
 *
 *   npm run test:format
 *
 * Exits 1 on the first violations and prints the failing cases.
 */
import { money, signedMoney, signedPct, pnlSign, sharePrice, POINTS_SHORT } from "../src/lib/format";

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
/**
 * `Intl` puts a left-to-right mark in front of a negative number in a Hebrew
 * locale, so the browser renders "-12" and not "12-". It is invisible, it is
 * correct, and it must not make a test about digits fail — so the comparison
 * ignores the bidi marks and nothing else.
 */
function eq(name: string, got: string, want: string) {
  const bare = (s: string) => s.replace(/[\u200e\u200f]/g, "");
  check(name, bare(got) === bare(want), { got, want });
}

/** the digits back out of a formatted amount, for the round-trip property */
function parse(s: string): number {
  return Number(s.replace(/[^0-9.\-]/g, ""));
}

// ---- whole points, rounded --------------------------------------------------

eq("a fraction of a point is not a number a player reads", money(0.37), "0 נק׳");
eq("and it rounds up when it is more than half", money(0.62), "1 נק׳");
eq("a score rounds to the nearest point", money(9999.634), "10,000 נק׳");
eq("hundredths never truncate a score downwards", money(12.9), "13 נק׳");
eq("the starting balance", money(10_000), "10,000 נק׳");
eq("zero", money(0), "0 נק׳");
eq("a whole-point bet", money(100), "100 נק׳");
eq("nothing is not minus nothing", money(-0.004), "0 נק׳");
eq("a real loss keeps its minus", money(-12.4), "-12 נק׳");

// ---- compact: the overview form volume needs --------------------------------

eq("compact keeps millions short", money(1_250_000, { compact: true }), "1.3M נק׳");
eq("compact keeps volume short", money(12_345, { compact: true }), "12.3K נק׳");
eq("compact rounds a normal volume", money(1234.56, { compact: true }), "1,235 נק׳");

// ---- P&L and share prices ---------------------------------------------------
//
// A price is the one amount that is NOT a score: it is what one answer costs,
// between 0 and 1, and rounding it to whole points would erase it entirely.

eq("a win of twelve points", signedMoney(12), "+12 נק׳");
eq("a loss of twelve points", signedMoney(-12), "-12 נק׳");
eq("the cost of one answer always shows hundredths", sharePrice(0.42), "0.42 נק׳");

// ---- a displayed zero is unsigned, and is neither a win nor a loss -----------
//
// The rounding happens BEFORE the sign is chosen. A position that moved by two
// hundredths of a point prints "0", and "-0" is a number wearing a sign it does
// not have — nor may anything that prints as zero be painted green or red.

eq("a loss too small to show is plain zero", signedMoney(-0.09), "0 נק׳");
eq("a gain too small to show is plain zero", signedMoney(0.09), "0 נק׳");
eq("an exact zero is plain zero", signedMoney(0), "0 נק׳");
eq("negative zero is plain zero", signedMoney(-0), "0 נק׳");
eq("more than half a point is a real loss", signedMoney(-0.6), "-1 נק׳");
check("a sliver of a loss is toned as zero", pnlSign(-0.04) === 0, { v: -0.04 });
check("a real loss is toned as a loss", pnlSign(-2) === -1, { v: -2 });
check("a real gain is toned as a gain", pnlSign(2) === 1, { v: 2 });

// ---- a return under a tenth of a percent is not a return --------------------

eq("a return carries its sign", signedPct(0.0123), "+1.2%");
eq("a negative return carries its sign", signedPct(-0.0123), "-1.2%");
eq("a return too small to show is not shown as 0%", signedPct(-0.0001), "—");
eq("and neither is an exact zero", signedPct(0), "—");

// ---- the property: the digits are the amount, and zero is unsigned ----------

for (let i = 0; i < 100_000; i++) {
  const v = (Math.random() - 0.3) * Math.pow(10, Math.random() * 5);
  const rounded = Math.round(v) || 0;
  const s = money(v);
  check("the digits are the amount, rounded to the point", parse(s) === rounded, { v, s, rounded });
  check("a rounded amount never carries a minus sign it lost", !(rounded === 0 && s.includes("-")), { v, s });
  const signed = signedMoney(v);
  // the unit rides along, so a stray ₪ anywhere in the formatter fails here too
  check("a signed amount carries the sign and the unit", new RegExp(`^[+-]?[\\d,]+ ${POINTS_SHORT}$`).test(signed), { v, signed });
  check("only a displayed zero drops the sign", /^[+-]/.test(signed) === (rounded !== 0), { v, signed });
  check("a signed amount never shows a signed zero", signed !== `-0 ${POINTS_SHORT}` && signed !== `+0 ${POINTS_SHORT}`, { v, signed });
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ money(): whole points, rounded not truncated, and a displayed zero is unsigned");
