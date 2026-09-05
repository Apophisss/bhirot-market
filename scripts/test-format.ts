/**
 * Checks the points formatter (src/lib/format.ts).
 *
 * Every amount on the board is a real number, not a whole point: a sale, a
 * payout and a profit/loss line all land on hundredths. The formatter therefore
 * has one promise worth a test — it never hides an amount that exists:
 *   1. an amount with a fraction shows it ("0.37 נק׳" is not "0 נק׳",
 *      "9,999.63 נק׳" is not "10,000 נק׳"), and the printed digits are the amount
 *      rounded to hundredths;
 *   2. a round amount stays round (10,000 does not become "10,000.00");
 *   3. `decimals: true` still pins the fraction on, and `compact` still gives the
 *      short K/M overview volume needs — but never erases an amount to "0 נק׳".
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
function eq(name: string, got: string, want: string) {
  check(name, got === want, { got, want });
}

/** the digits back out of a formatted amount, for the round-trip property */
function parse(s: string): number {
  return Number(s.replace(/[^0-9.\-]/g, ""));
}

// ---- agorot show whenever they exist ----------------------------------------

eq("a profit of 37 hundredths is not zero", money(0.37), "0.37 נק׳");
eq("four hundredths are four hundredths", money(0.04), "0.04 נק׳");
eq("a score keeps its fraction", money(9999.634), "9,999.63 נק׳");
eq("hundredths round, they do not truncate", money(12.345), "12.35 נק׳");
eq("half a point", money(1234.5), "1,234.50 נק׳");

// ---- a round amount stays round ---------------------------------------------

eq("the starting balance", money(10_000), "10,000 נק׳");
eq("zero", money(0), "0 נק׳");
eq("a whole-point bet", money(100), "100 נק׳");
eq("under half a hundredth is nothing", money(0.004), "0 נק׳");
eq("and nothing is not minus nothing", money(-0.004), "0 נק׳");

// ---- the explicit options ---------------------------------------------------

eq("decimals pins the fraction onto a round amount", money(5, { decimals: true }), "5.00 נק׳");
eq("compact keeps millions short", money(1_250_000, { compact: true }), "1.3M נק׳");
eq("compact keeps volume short", money(12_345, { compact: true }), "12.3K נק׳");
eq("compact rounds a normal volume", money(1234.56, { compact: true }), "1,235 נק׳");
eq("compact still refuses to erase a real amount", money(0.42, { compact: true }), "0.42 נק׳");

// ---- P&L and share prices ---------------------------------------------------

eq("a win of 37 hundredths", signedMoney(0.37), "+0.37 נק׳");
eq("a loss of 37 hundredths", signedMoney(-0.37), "-0.37 נק׳");
eq("a round win still shows the fraction", signedMoney(12), "+12.00 נק׳");
eq("the cost of one answer always shows hundredths", sharePrice(0.42), "0.42 נק׳");

// ---- a displayed zero is unsigned, and is neither a win nor a loss -----------
//
// A round trip that cost less than half a hundredth used to print "-0.00":
// the rounding happened after the sign was chosen. Zero has no sign,
// and nothing that prints as zero may be painted green or red either.

eq("a loss too small to show is plain zero", signedMoney(-0.001), "0.00 נק׳");
eq("a gain too small to show is plain zero", signedMoney(0.001), "0.00 נק׳");
eq("an exact zero is plain zero", signedMoney(0), "0.00 נק׳");
eq("negative zero is plain zero", signedMoney(-0), "0.00 נק׳");
// (JS rounds -0.5 to -0, so the first value that survives the rounding is -0.006)
eq("more than half a hundredth is a real loss", signedMoney(-0.006), "-0.01 נק׳");
check("a sliver of a loss is toned as zero", pnlSign(-0.004) === 0, { v: -0.004 });
check("a real loss is toned as a loss", pnlSign(-0.02) === -1, { v: -0.02 });
check("a real gain is toned as a gain", pnlSign(0.02) === 1, { v: 0.02 });

eq("a return carries its sign", signedPct(0.0123), "+1.2%");
eq("a negative return carries its sign", signedPct(-0.0123), "-1.2%");
eq("a return too small to show is unsigned", signedPct(-0.0001), "0%");

// ---- the property: nothing real is ever displayed as zero ------------------

for (let i = 0; i < 100_000; i++) {
  const v = (Math.random() - 0.3) * Math.pow(10, Math.random() * 5);
  const rounded = Math.round(v * 100) / 100;
  const s = money(v);
  if (Math.abs(rounded) >= 0.01) {
    check("a real amount is never shown as zero", s !== `0 ${POINTS_SHORT}` && s !== `-0 ${POINTS_SHORT}`, { v, s });
  }
  check("the digits are the amount, to the hundredth", Math.abs(parse(s) - rounded) < 1e-9, { v, s, rounded });
  const signed = signedMoney(v);
  // a value that rounds to zero prints unsigned; everything else keeps its sign
  // the unit rides along, so a stray ₪ anywhere in the formatter fails here too
  check("a signed amount carries the sign, the fraction and the unit", new RegExp(`^[+-]?[\\d,]+\\.\\d{2} ${POINTS_SHORT}$`).test(signed), { v, signed });
  check("only a displayed zero drops the sign", /^[+-]/.test(signed) === (Math.abs(Math.round(v * 100)) > 0), { v, signed });
  check("a signed amount never shows a signed zero", signed !== `-0.00 ${POINTS_SHORT}` && signed !== `+0.00 ${POINTS_SHORT}`, { v, signed });
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ money(): points, fractions show wherever they exist, round amounts stay round");
