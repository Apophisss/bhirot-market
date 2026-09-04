/**
 * Invariant tests for the elasticity layer (src/lib/elasticity.ts) — the
 * numbers the editorial routine uses to pick a market's `liquidity`.
 * No framework — plain assertions so it runs anywhere `tsx` runs. Run: npm test
 */
import assert from "node:assert/strict";
import { initialState, priceYes } from "../src/lib/lmsr";
import {
  amountToReach,
  cheapSideImpact,
  impactPp,
  recommend,
  verdict,
  CANDIDATE_B,
  DEFAULT_B,
  NORMAL_TRADE,
  NORMAL_IMPACT_PP,
} from "../src/lib/elasticity";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

/** The band AGENT.md asks new questions to be priced in. */
const EDITORIAL_PROBS = [0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95];

test("amountToReach lands on the requested price", () => {
  for (const b of CANDIDATE_B) {
    for (const p of EDITORIAL_PROBS) {
      for (const target of [0.1, 0.4, 0.6, 0.9]) {
        if (Math.abs(target - p) < 0.02) continue;
        const state = initialState(p, b);
        const amount = amountToReach(state, target);
        assert.ok(amount > 0, `p=${p} b=${b} target=${target}: expected a positive cost`);
        const side = target > p ? "YES" : "NO";
        const reached = priceYes({
          ...state,
          ...(side === "YES"
            ? { qYes: state.qYes + Math.abs(Math.log(target / (1 - target)) - Math.log(p / (1 - p))) * b }
            : { qNo: state.qNo + Math.abs(Math.log(target / (1 - target)) - Math.log(p / (1 - p))) * b }),
        });
        assert.ok(Math.abs(reached - target) < 1e-9, `p=${p} b=${b}: reached ${reached}, wanted ${target}`);
      }
    }
  }
});

test("the same bet moves a thinner market more", () => {
  for (const p of EDITORIAL_PROBS) {
    for (let i = 1; i < CANDIDATE_B.length; i++) {
      const thin = cheapSideImpact(initialState(p, CANDIDATE_B[i - 1]), NORMAL_TRADE);
      const thick = cheapSideImpact(initialState(p, CANDIDATE_B[i]), NORMAL_TRADE);
      assert.ok(thin > thick, `p=${p}: b=${CANDIDATE_B[i - 1]} moved ${thin}pp, b=${CANDIDATE_B[i]} moved ${thick}pp`);
    }
  }
});

test("a bigger order moves the price further", () => {
  for (const p of EDITORIAL_PROBS) {
    const state = initialState(p, DEFAULT_B);
    let last = 0;
    for (const amount of [10, 50, 100, 500, 1000]) {
      const move = cheapSideImpact(state, amount);
      assert.ok(move > last, `p=${p}: ₪${amount} moved ${move}pp, not more than ${last}pp`);
      last = move;
    }
  }
});

test("elasticity is symmetric — a 20% market feels like an 80% one", () => {
  for (const b of CANDIDATE_B) {
    for (const p of EDITORIAL_PROBS) {
      const a = verdict(p, b);
      const mirror = verdict(1 - p, b);
      assert.equal(a.zone, mirror.zone, `p=${p} vs ${1 - p} at b=${b}`);
      assert.ok(Math.abs(a.normalPp - mirror.normalPp) < 1e-9, `p=${p} vs ${1 - p} at b=${b}`);
    }
  }
});

test("the cheap side is the one that moves", () => {
  for (const b of CANDIDATE_B) {
    for (const p of [0.1, 0.25, 0.75, 0.9]) {
      const state = initialState(p, b);
      const cheap = p < 0.5 ? "YES" : "NO";
      const expensive = cheap === "YES" ? "NO" : "YES";
      const cheapMove = Math.abs(impactPp(state, cheap, NORMAL_TRADE));
      const expensiveMove = Math.abs(impactPp(state, expensive, NORMAL_TRADE));
      assert.ok(cheapMove > expensiveMove, `p=${p} b=${b}: cheap ${cheapMove}pp vs expensive ${expensiveMove}pp`);
      assert.ok(Math.abs(cheapSideImpact(state, NORMAL_TRADE) - cheapMove) < 1e-9);
    }
  }
});

test("the house default is healthy across the whole editorial price band", () => {
  for (const p of EDITORIAL_PROBS) {
    const v = verdict(p, DEFAULT_B);
    assert.equal(v.zone, "balanced", `p=${p}: b=${DEFAULT_B} is ${v.zone} (${v.note})`);
    assert.ok(
      v.normalPp >= NORMAL_IMPACT_PP.min && v.normalPp <= NORMAL_IMPACT_PP.max,
      `p=${p}: ₪100 moves ${v.normalPp}pp`,
    );
  }
});

test("recommend only ever returns a liquidity the schema accepts", () => {
  for (let p = 0.02; p <= 0.98; p += 0.01) {
    for (const traffic of ["hot", "normal", "niche"] as const) {
      const b = recommend(Number(p.toFixed(2)), traffic);
      assert.ok(CANDIDATE_B.includes(b as (typeof CANDIDATE_B)[number]), `p=${p} ${traffic} → ${b}`);
      assert.ok(b >= 200 && b <= 100000, `p=${p} ${traffic} → ${b} is outside the schema range`);
    }
  }
});

test("traffic never makes a hot market thinner than a niche one", () => {
  for (let p = 0.05; p <= 0.95; p += 0.05) {
    const q = Number(p.toFixed(2));
    assert.ok(recommend(q, "hot") >= recommend(q, "normal"), `p=${q}`);
    assert.ok(recommend(q, "normal") >= recommend(q, "niche"), `p=${q}`);
  }
});

test("recommend prefers the house default whenever it is healthy", () => {
  for (const p of EDITORIAL_PROBS) {
    assert.equal(recommend(p, "normal"), DEFAULT_B, `p=${p}`);
  }
});

console.log(`✓ elasticity: ${passed} invariant tests passed`);
