/**
 * Invariants of the anonymous leaderboard (src/lib/fake-leaderboard.ts).
 * Pure functions only — no database. Run: npm test
 *
 * Two properties matter and both are checked here: the board leaks no identity,
 * and the fabricated crowd is deterministic (same clock step → same board on
 * every device) while still drifting a little between steps.
 */
import assert from "node:assert/strict";
import {
  buildBoard,
  epochAt,
  fabricatedTraders,
  handleForSlot,
  FAKE_LEADER_EPOCH_MS,
  FAKE_TRADER_COUNT,
  HANDLE_SLOTS,
  type RealTrader,
} from "../src/lib/fake-leaderboard";
import { STARTING_BALANCE } from "../src/lib/db/schema";

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

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);
const NEXT = NOW + FAKE_LEADER_EPOCH_MS;

const REAL: RealTrader[] = [
  { userId: "u-alice", netWorth: 12_400, pnl: 2_400, tradeCount: 31 },
  { userId: "u-bob", netWorth: 9_100, pnl: -900, tradeCount: 12 },
  { userId: "u-carol", netWorth: 10_000, pnl: 0, tradeCount: 1 },
];

test("the crowd is a few hundred traders", () => {
  assert.ok(FAKE_TRADER_COUNT >= 300, `expected a few hundred, got ${FAKE_TRADER_COUNT}`);
  assert.equal(fabricatedTraders(epochAt(NOW)).length, FAKE_TRADER_COUNT);
  assert.equal(buildBoard(REAL, { now: NOW }).length, FAKE_TRADER_COUNT + REAL.length);
});

test("the same clock step renders the same board", () => {
  const a = buildBoard(REAL, { now: NOW });
  const b = buildBoard(REAL, { now: NOW + FAKE_LEADER_EPOCH_MS - 1 });
  assert.deepEqual(a, b);
});

test("the next step moves the board, but gently", () => {
  const a = fabricatedTraders(epochAt(NOW));
  const b = fabricatedTraders(epochAt(NEXT));
  assert.notDeepEqual(a, b, "the crowd should not be frozen");
  for (let i = 0; i < a.length; i++) {
    const move = Math.abs(b[i].netWorth - a[i].netWorth) / a[i].netWorth;
    assert.ok(move < 0.03, `trader ${i} jumped ${(move * 100).toFixed(1)}% between steps`);
    assert.ok(b[i].tradeCount >= a[i].tradeCount - 3, "trade counts should not collapse between steps");
  }
});

test("no row carries an identity", () => {
  const board = buildBoard(REAL, { now: NOW, meId: "u-alice" });
  const allowed = new Set(["rank", "handle", "netWorth", "pnl", "tradeCount", "isMe", "fabricated"]);
  for (const row of board) {
    for (const key of Object.keys(row)) assert.ok(allowed.has(key), `row exposes "${key}"`);
  }
  const serialized = JSON.stringify(board);
  for (const r of REAL) assert.ok(!serialized.includes(r.userId), `board serialization contains ${r.userId}`);
});

test("every trader gets a distinct handle", () => {
  const board = buildBoard(REAL, { now: NOW });
  const handles = new Set(board.map((r) => r.handle));
  assert.equal(handles.size, board.length);
  for (const r of board) assert.ok(r.handle.trim().length > 0);
});

test("handles fill the slot space without collisions", () => {
  const seen = new Set<string>();
  for (let s = 0; s < HANDLE_SLOTS; s++) seen.add(handleForSlot(s));
  assert.equal(seen.size, HANDLE_SLOTS);
  assert.equal(handleForSlot(HANDLE_SLOTS), handleForSlot(0), "slots wrap around");
});

test("ranks are 1..n and ordered by net worth", () => {
  const board = buildBoard(REAL, { now: NOW });
  board.forEach((r, i) => assert.equal(r.rank, i + 1));
  for (let i = 1; i < board.length; i++) {
    assert.ok(board[i - 1].netWorth >= board[i].netWorth, `row ${i} is out of order`);
  }
});

test("a real trader is ranked among the crowd, not appended to it", () => {
  const whale: RealTrader = { userId: "u-whale", netWorth: 999_999, pnl: 989_999, tradeCount: 900 };
  const minnow: RealTrader = { userId: "u-minnow", netWorth: 1, pnl: -9_999, tradeCount: 4 };
  const board = buildBoard([whale, minnow], { now: NOW });
  assert.equal(board[0].fabricated, false, "the whale should top the board");
  assert.equal(board[board.length - 1].fabricated, false, "the minnow should sit last");
  const mid = buildBoard(REAL, { now: NOW }).filter((r) => !r.fabricated).map((r) => r.rank);
  for (const rank of mid) assert.ok(rank > 1 && rank < FAKE_TRADER_COUNT, `a mid-pack trader landed at ${rank}`);
});

test("only the visitor's own row is marked, and only when signed in", () => {
  const board = buildBoard(REAL, { now: NOW, meId: "u-bob" });
  assert.equal(board.filter((r) => r.isMe).length, 1);
  assert.equal(board.find((r) => r.isMe)!.netWorth, 9_100);
  assert.equal(buildBoard(REAL, { now: NOW }).filter((r) => r.isMe).length, 0);
  assert.equal(buildBoard(REAL, { now: NOW, meId: "u-nobody" }).filter((r) => r.isMe).length, 0);
});

test("the fabricated numbers stay plausible", () => {
  const crowd = fabricatedTraders(epochAt(NOW));
  for (const t of crowd) {
    assert.ok(t.netWorth > 0, "net worth must stay positive");
    assert.ok(t.netWorth < 40 * STARTING_BALANCE, `net worth ${t.netWorth} is not believable`);
    assert.ok(t.tradeCount >= 1 && t.tradeCount <= 500, `trade count ${t.tradeCount} is out of range`);
    assert.ok(Math.abs(t.pnl - (t.netWorth - STARTING_BALANCE)) < 1e-6, "pnl must equal net worth minus the stake");
  }
  const sorted = [...crowd].map((t) => t.netWorth).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(Math.abs(median - STARTING_BALANCE) < 0.25 * STARTING_BALANCE, `median ${median} drifted off the stake`);
  const winners = crowd.filter((t) => t.pnl > 0).length;
  assert.ok(winners > crowd.length * 0.25 && winners < crowd.length * 0.75, `${winners} winners is a lopsided board`);
});

console.log(`✓ leaderboard: ${passed} tests passed`);
