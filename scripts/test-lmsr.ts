/**
 * Invariant tests for the LMSR market maker. Run: npm test
 * No framework — plain assertions so it runs anywhere `tsx` runs.
 */
import assert from "node:assert/strict";
import {
  apply,
  cost,
  costToBuy,
  holdingValue,
  initialState,
  maxBuyAmount,
  PRICE_BAND,
  priceYes,
  proceedsFromSell,
  positionValue,
  quoteBuy,
  quoteSell,
  sharesForAmount,
  withinBand,
  type MarketState,
} from "../src/lib/lmsr";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}
const close = (a: number, b: number, eps = 1e-6, what = "") =>
  assert.ok(Math.abs(a - b) < eps, `${what} expected ${b}, got ${a} (diff ${Math.abs(a - b)})`);

const B_VALUES = [200, 2000, 100000];
const PROBS = [0.03, 0.1, 0.35, 0.5, 0.72, 0.97];

test("initialState reproduces the requested probability", () => {
  for (const b of B_VALUES) for (const p of PROBS) close(priceYes(initialState(p, b)), p, 1e-9, `p=${p} b=${b}`);
});

test("initialState clamps extreme probabilities into (0,1)", () => {
  for (const b of B_VALUES) {
    assert.ok(priceYes(initialState(0.0001, b)) > 0);
    assert.ok(priceYes(initialState(0.9999, b)) < 1);
  }
});

test("repeated band-capped buys keep the price inside the tradable band", () => {
  for (const b of B_VALUES) {
    let s = initialState(0.4, b);
    for (let i = 0; i < 25; i++) {
      const cap = maxBuyAmount(s, "YES");
      if (cap <= 0) break;
      s = apply(s, "YES", sharesForAmount(s, "YES", Math.min(cap, 5000)));
      const p = priceYes(s);
      assert.ok(p > 0 && p < 1, `price out of range: ${p}`);
      assert.ok(withinBand(s), `left the band: ${p}`);
    }
    assert.ok(priceYes(s) <= PRICE_BAND.max + 1e-9, `ended above the band: ${priceYes(s)}`);
  }
});

test("maxBuyAmount lands exactly on the band ceiling", () => {
  for (const b of B_VALUES)
    for (const p of PROBS)
      for (const side of ["YES", "NO"] as const) {
        const s = initialState(p, b);
        const cap = maxBuyAmount(s, side);
        assert.ok(cap > 0, `no headroom at p=${p} b=${b} ${side}`);
        const q = quoteBuy(s, side, cap);
        close(q.priceAfter, PRICE_BAND.max, 1e-6, `cap landed off-band b=${b} p=${p} ${side}`);
      }
});

test("selling is never capped: any holding can be sold back in full", () => {
  // the band is a buy-side guard only, so that a position is always liquidatable
  for (const b of B_VALUES)
    for (const p of PROBS) {
      const s0 = initialState(p, b);
      // a holding big enough to push the price far below the band floor
      const held = sharesForAmount(s0, "YES", maxBuyAmount(s0, "YES"));
      const sell = quoteSell(s0, "YES", held);
      assert.ok(Number.isFinite(sell.amount), `non-finite proceeds b=${b} p=${p}`);
      assert.ok(sell.amount >= 0, `negative proceeds ${sell.amount} b=${b} p=${p}`);
      assert.ok(sell.amount <= held + 1e-6, `paid more than the shares can be worth b=${b} p=${p}`);
      const after = apply(s0, "YES", -held);
      const pAfter = priceYes(after);
      assert.ok(pAfter > 0 && pAfter < 1, `price left (0,1) after a full exit: ${pAfter}`);
      assert.ok(pAfter < p + 1e-9, "a sale can only lower the price");
    }
});

test("sharesForAmount is the exact inverse of costToBuy", () => {
  for (const b of B_VALUES)
    for (const p of PROBS)
      for (const amt of [1, 25, 300, 7500]) {
        const s = initialState(p, b);
        for (const side of ["YES", "NO"] as const) {
          const shares = sharesForAmount(s, side, amt);
          close(costToBuy(s, side, shares), amt, 1e-6, `b=${b} p=${p} amt=${amt} ${side}`);
        }
      }
});

test("buying then immediately selling back is a round trip to the same price and cash", () => {
  for (const b of B_VALUES)
    for (const p of PROBS)
      for (const amt of [10, 500, 20000]) {
        const s0 = initialState(p, b);
        const buy = quoteBuy(s0, "YES", amt);
        const s1 = apply(s0, "YES", buy.shares);
        const sell = quoteSell(s1, "YES", buy.shares);
        close(sell.amount, amt, 1e-6, `refund b=${b} p=${p}`);
        close(priceYes(apply(s1, "YES", -buy.shares)), p, 1e-9, `price restored b=${b} p=${p}`);
      }
});

test("buying YES raises the YES price, buying NO lowers it", () => {
  const s = initialState(0.5, 2000);
  assert.ok(quoteBuy(s, "YES", 1000).priceAfter > 0.5);
  assert.ok(priceYes(apply(s, "NO", sharesForAmount(s, "NO", 1000))) < 0.5);
});

test("average price paid is always worse than the pre-trade price (slippage)", () => {
  for (const b of B_VALUES)
    for (const p of PROBS)
      for (const amt of [100, 5000]) {
        const s = initialState(p, b);
        for (const side of ["YES", "NO"] as const) {
          const q = quoteBuy(s, side, amt);
          assert.ok(q.avgPrice >= q.priceBefore - 1e-9, `avg ${q.avgPrice} < before ${q.priceBefore}`);
          assert.ok(q.avgPrice <= q.priceAfter + 1e-9, `avg ${q.avgPrice} > after ${q.priceAfter}`);
        }
      }
});

test("a bigger order gets a worse average price", () => {
  const s = initialState(0.45, 2000);
  const small = quoteBuy(s, "YES", 100).avgPrice;
  const big = quoteBuy(s, "YES", 10000).avgPrice;
  assert.ok(big > small, `big order ${big} should cost more per share than small ${small}`);
});

test("more liquidity means less slippage", () => {
  const thin = quoteBuy(initialState(0.5, 500), "YES", 2000).priceAfter;
  const deep = quoteBuy(initialState(0.5, 20000), "YES", 2000).priceAfter;
  assert.ok(thin > deep, `thin book (${thin}) should move more than deep (${deep})`);
});

test("the market maker's worst-case loss is bounded by b*ln(2)", () => {
  for (const b of B_VALUES) {
    const s0 = initialState(0.5, b);
    let s: MarketState = s0;
    // hammer one side, then measure subsidy = payout owed - cash taken in
    let cash = 0;
    for (let i = 0; i < 40; i++) {
      const amt = Math.min(5000, maxBuyAmount(s, "YES"));
      if (amt <= 0) break;
      const shares = sharesForAmount(s, "YES", amt);
      cash += amt;
      s = apply(s, "YES", shares);
    }
    const owed = s.qYes - s0.qYes; // each YES share pays 1 if YES resolves
    const subsidy = owed - cash;
    assert.ok(subsidy <= b * Math.LN2 + 1e-6, `subsidy ${subsidy} exceeded bound ${b * Math.LN2}`);
  }
});

test("cost function is numerically stable at extreme inventories", () => {
  const s: MarketState = { qYes: 1e7, qNo: -1e7, b: 2000 };
  assert.ok(Number.isFinite(cost(s)), "cost overflowed");
  assert.ok(Number.isFinite(priceYes(s)), "price overflowed");
  close(priceYes(s), 1, 1e-9, "extreme inventory saturates at 1");
  assert.ok(Number.isFinite(proceedsFromSell(s, "YES", 100)));
});

test("zero and negative amounts buy nothing", () => {
  const s = initialState(0.5, 2000);
  close(sharesForAmount(s, "YES", 0), 0, 1e-12);
  close(sharesForAmount(s, "YES", -100), 0, 1e-12);
});

/* --------------------------- valuing a position -------------------------- */

test("a position is worth exactly what selling it quotes", () => {
  for (const b of [500, 2000, 8000]) {
    for (const p of [0.05, 0.3, 0.5, 0.85]) {
      const s = initialState(p, b);
      for (const shares of [1, 50, 400, 5000]) {
        close(positionValue(s, "YES", shares), quoteSell(s, "YES", shares).amount, 1e-9, "YES");
        close(positionValue(s, "NO", shares), quoteSell(s, "NO", shares).amount, 1e-9, "NO");
      }
    }
  }
});

test("shares x price always overstates a position, never the other way round", () => {
  // the reason the portfolio may not mark at the marginal price: the gap is the
  // paper profit a trader could never realise, and it grows as the market thins.
  const b = 500;
  let s = initialState(0.5, b);
  const shares = sharesForAmount(s, "YES", 100);
  s = apply(s, "YES", shares);
  const marginal = shares * priceYes(s);
  const real = positionValue(s, "YES", shares);
  assert.ok(real < marginal, "the sale cannot pay the marginal price");
  assert.ok(real <= 100 + 1e-9, `buying ₪100 cannot be worth ${real} the instant it fills`);
  assert.ok(marginal > 105, `setup: expected a phantom gain on a thin market, got ${marginal}`);
});

test("an empty or nonsensical holding is worth nothing", () => {
  const s = initialState(0.5, 2000);
  close(positionValue(s, "YES", 0), 0, 1e-12);
  close(positionValue(s, "YES", -10), 0, 1e-12);
  close(positionValue(s, "NO", NaN), 0, 1e-12);
  close(holdingValue(s, 0, 0).total, 0, 1e-12);
});

test("both legs of a hedge are worth what closing them one after the other pays", () => {
  const s = initialState(0.4, 1500);
  const yes = 300;
  const no = 180;
  const v = holdingValue(s, yes, no);
  const afterYes = apply(s, "YES", -yes);
  close(v.yes, proceedsFromSell(s, "YES", yes), 1e-9, "the YES leg alone");
  close(v.no, proceedsFromSell(afterYes, "NO", no), 1e-9, "the NO leg out of what is left");
  close(v.total, cost(s) - cost(apply(afterYes, "NO", -no)), 1e-9, "the pair together");
  // a matched pair pays ₪1 at resolution whichever way it goes, so it is worth
  // its size no matter where the price sits
  const pair = holdingValue(s, 250, 250).total;
  close(pair, 250, 1e-9, "a matched pair is worth its size");
});

test("a single leg is not made cheaper by valuing it through the pair", () => {
  const s = initialState(0.6, 2000);
  close(holdingValue(s, 400, 0).yes, positionValue(s, "YES", 400), 1e-12, "YES only");
  close(holdingValue(s, 0, 400).no, positionValue(s, "NO", 400), 1e-12, "NO only");
});

console.log(`lmsr: ${passed} invariant tests passed`);
