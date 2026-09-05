/**
 * Checks the money formatter (src/lib/format.ts).
 *
 * Every amount on the board is a real number, not a whole shekel: a sale, a
 * payout and a P&L line all land on agorot. The formatter therefore has one
 * promise worth a test — it never hides an amount that exists:
 *   1. an amount with agorot shows them (₪0.37 is not "₪0", ₪9,999.63 is not
 *      "₪10,000"), and the printed digits are the amount rounded to agorot;
 *   2. a round amount stays round (₪10,000 does not become "₪10,000.00");
 *   3. `decimals: true` still pins the agorot on, and `compact` still gives the
 *      short K/M overview volume needs — but not a "₪0" for real money.
 *
 *   npm run test:format
 *
 * Exits 1 on the first violations and prints the failing cases.
 */
import { money, signedMoney, sharePrice } from "../src/lib/format";

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

eq("a profit of 37 agorot is not ₪0", money(0.37), "₪0.37");
eq("four agorot are four agorot", money(0.04), "₪0.04");
eq("a balance keeps its agorot", money(9999.634), "₪9,999.63");
eq("agorot round, they do not truncate", money(12.345), "₪12.35");
eq("half a shekel", money(1234.5), "₪1,234.50");

// ---- a round amount stays round ---------------------------------------------

eq("the starting balance", money(10_000), "₪10,000");
eq("zero", money(0), "₪0");
eq("a whole-shekel bet", money(100), "₪100");
eq("under half an agora is nothing", money(0.004), "₪0");
eq("and nothing is not minus nothing", money(-0.004), "₪0");

// ---- the explicit options ---------------------------------------------------

eq("decimals pins agorot onto a round amount", money(5, { decimals: true }), "₪5.00");
eq("compact keeps millions short", money(1_250_000, { compact: true }), "₪1.3M");
eq("compact keeps volume short", money(12_345, { compact: true }), "₪12.3K");
eq("compact rounds a normal volume", money(1234.56, { compact: true }), "₪1,235");
eq("compact still refuses to erase real money", money(0.42, { compact: true }), "₪0.42");

// ---- P&L and share prices ---------------------------------------------------

eq("a win of 37 agorot", signedMoney(0.37), "+₪0.37");
eq("a loss of 37 agorot", signedMoney(-0.37), "-₪0.37");
eq("a round win still shows agorot", signedMoney(12), "+₪12.00");
eq("a share price is always in agorot", sharePrice(0.42), "₪0.42");

// ---- the property: nothing real is ever displayed as ₪0 ---------------------

for (let i = 0; i < 100_000; i++) {
  const v = (Math.random() - 0.3) * Math.pow(10, Math.random() * 5);
  const rounded = Math.round(v * 100) / 100;
  const s = money(v);
  if (Math.abs(rounded) >= 0.01) {
    check("a real amount is never shown as ₪0", s !== "₪0" && s !== "₪-0", { v, s });
  }
  check("the digits are the amount, to the agora", Math.abs(parse(s) - rounded) < 1e-9, { v, s, rounded });
  const signed = signedMoney(v);
  check("signed P&L carries the sign and the agorot", /^[+-]₪[\d,]+\.\d{2}$/.test(signed), { v, signed });
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ money(): agorot show wherever they exist, round amounts stay round");
