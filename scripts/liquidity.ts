/**
 * Liquidity (elasticity) lab — the calculator behind the "how elastic should
 * this market be?" decision in `.claude/skills/market-questions`.
 *
 *   npx tsx scripts/liquidity.ts --p 0.25                    compare candidate b values
 *   npx tsx scripts/liquidity.ts --p 0.25 --traffic hot      ...for a featured question
 *   npx tsx scripts/liquidity.ts --p 0.25 --b 2000           one b, in detail
 *   npx tsx scripts/liquidity.ts --slug netanyahu-testifies  an existing market
 *   npx tsx scripts/liquidity.ts --audit                     every open market
 *
 * Nothing here writes files or hits the network — it is a calculator.
 */
import fs from "node:fs";
import { initialState, maxBuyAmount, quoteBuy } from "../src/lib/lmsr";
import { amountToReach, recommend, verdict, CANDIDATE_B, type Traffic } from "../src/lib/elasticity";
import { MarketsFileSchema } from "../src/lib/content";

/** Trade sizes the trade panel offers, plus a whale at 10% of the ₪10,000 starting balance. */
const TRADE_SIZES = [10, 50, 100, 500, 1000];

const money = (n: number) => (n >= 10000 ? "₪" + Math.round(n / 1000) + "k" : "₪" + Math.round(n));
const pct = (p: number) => (p * 100).toFixed(1) + "%";

function detail(p: number, b: number) {
  const state = initialState(p, b);
  console.log(`\nliquidity b=${b}, opening price ${pct(p)}`);
  console.log("  buy YES:  " + TRADE_SIZES.map((a) => `${money(a)} → ${pct(quoteBuy(state, "YES", a).priceAfter)}`).join("   "));
  console.log("  buy NO:   " + TRADE_SIZES.map((a) => `${money(a)} → ${pct(quoteBuy(state, "NO", a).priceAfter)}`).join("   "));
  const targets = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95].filter((t) => Math.abs(t - p) > 0.02);
  console.log("  to reach: " + targets.map((t) => `${pct(t)} = ${money(amountToReach(state, t))}`).join("  "));
  console.log(`  band cap: ${money(maxBuyAmount(state, "YES"))} buys YES up to 99%, ${money(maxBuyAmount(state, "NO"))} buys NO down to 1%`);
  const v = verdict(p, b);
  console.log(`  verdict:  ${v.ok ? "ok" : " ·"} ${v.zone} — ${v.note}`);
}

function compare(p: number, traffic: Traffic) {
  // Everything below is measured on the cheap side — the one ₪100 buys the most
  // shares of, and therefore the one that decides how the market feels.
  const cheap = p <= 0.5 ? "YES" : "NO";
  const toward = (delta: number) => (cheap === "YES" ? Math.min(0.97, p + delta) : Math.max(0.03, p - delta));
  console.log(`\nopening price ${pct(p)} — how elastic is the market at each b?`);
  console.log(`prices below are what the YES price becomes after buying the cheap side (${cheap})\n`);
  console.log("  b        ₪10      ₪100     ₪500     ₪1000    5pp costs  99% cap   verdict");
  for (const b of CANDIDATE_B) {
    const state = initialState(p, b);
    const priceAfter = (a: number) => {
      const q = quoteBuy(state, cheap, a);
      return pct(cheap === "YES" ? q.priceAfter : 1 - q.priceAfter).padEnd(8);
    };
    const five = money(amountToReach(state, toward(0.05))).padEnd(10);
    const cap = money(maxBuyAmount(state, cheap)).padEnd(9);
    const v = verdict(p, b);
    console.log(`  ${String(b).padEnd(8)} ${priceAfter(10)} ${priceAfter(100)} ${priceAfter(500)} ${priceAfter(1000)} ${five} ${cap} ${v.ok ? "ok" : " ·"} ${v.note}`);
  }
  console.log(`\n  → liquidity for a ${traffic} question at ${pct(p)}: ${recommend(p, traffic)}`);
}

function auditFile() {
  const file = MarketsFileSchema.parse(JSON.parse(fs.readFileSync("data/markets.json", "utf8")));
  const open = file.markets.filter((m) => m.status === "open");
  console.log(`elasticity of ${open.length} open markets (₪100 = a normal bet, ₪1000 = a whale, cheap side)\n`);
  let off = 0;
  for (const m of open) {
    const v = verdict(m.initialProbability, m.liquidity);
    if (!v.ok) off++;
    console.log(`  ${v.ok ? "ok" : " ·"} ${m.slug.padEnd(46)} p=${pct(m.initialProbability).padStart(5)} b=${String(m.liquidity).padEnd(5)} ${v.note}`);
  }
  console.log(`\n${open.length - off} of ${open.length} open markets sit in the healthy window.`);
  if (off) console.log("the rest are only worth re-pricing if they have no trades yet — liquidity is frozen once a market is live.");
}

// piping into `head` closes stdout early; that is not an error worth a stack trace
process.stdout.on("error", () => {});

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--audit")) {
  auditFile();
} else if (flag("slug")) {
  const slug = flag("slug");
  const file = MarketsFileSchema.parse(JSON.parse(fs.readFileSync("data/markets.json", "utf8")));
  const m = file.markets.find((x) => x.slug === slug);
  if (!m) {
    console.error(`no market with slug "${slug}" in data/markets.json`);
    process.exit(1);
  }
  console.log(`${m.title}\n  ${m.slug} · closes ${m.closesAt}`);
  detail(m.initialProbability, m.liquidity);
} else {
  const p = Number(flag("p") ?? 0.5);
  if (!(p > 0 && p < 1)) {
    console.error("--p must be a probability strictly between 0 and 1");
    process.exit(1);
  }
  const traffic = (flag("traffic") ?? "normal") as Traffic;
  if (!["hot", "normal", "niche"].includes(traffic)) {
    console.error("--traffic must be hot, normal or niche");
    process.exit(1);
  }
  const b = flag("b");
  if (b) for (const one of b.split(",").map(Number)) detail(p, one);
  else compare(p, traffic);
}
