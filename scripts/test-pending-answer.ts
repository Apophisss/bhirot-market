/**
 * Tests for the answer a visitor gives before they have an account.
 *
 * The property that matters is exactly-once. The stored answer becomes a binding
 * BUY the moment the deck picks it up, so a refresh, a back button or a second
 * read must come back empty — the visitor answered once and must be charged once.
 *
 * Run: npm run test:pending   (also part of `npm test`)
 */
import assert from "node:assert/strict";
// safe as a static import: the module only reaches for storage inside its functions,
// which run after the stub below is in place
import { savePendingAnswer, takePendingAnswer, clearPendingAnswer, PENDING_ANSWER_TTL_MS } from "../src/lib/pending-answer";

/** The module reaches for `window.sessionStorage`; node has neither. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

let storage = new MemoryStorage();
(globalThis as { window?: unknown }).window = {
  get sessionStorage() {
    return storage;
  },
};

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  storage = new MemoryStorage();
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}: ${(err as Error).message.split("\n")[0]}`);
  }
}

const answer = { marketId: "knesset-dissolves", side: "YES" as const, stake: 20, title: "האם הכנסת תתפזר?" };

test("an answer survives the trip to the login provider", () => {
  savePendingAnswer(answer);
  const got = takePendingAnswer();
  assert.equal(got?.marketId, answer.marketId);
  assert.equal(got?.side, "YES");
  assert.equal(got?.stake, 20);
  assert.equal(got?.title, answer.title);
});

test("reading it once is the only time it can be read", () => {
  savePendingAnswer(answer);
  assert.ok(takePendingAnswer(), "the first read is the answer");
  // a refresh right after the redirect must not place the same trade again
  assert.equal(takePendingAnswer(), null);
});

test("nothing stored is not an answer", () => {
  assert.equal(takePendingAnswer(), null);
});

test("a stale answer is dropped rather than executed at a price that has moved", () => {
  savePendingAnswer(answer);
  assert.equal(takePendingAnswer(Date.now() + PENDING_ANSWER_TTL_MS + 1000), null);
});

test("an answer still inside the window is executed", () => {
  savePendingAnswer(answer);
  assert.ok(takePendingAnswer(Date.now() + PENDING_ANSWER_TTL_MS - 1000));
});

test("a stale answer is cleared, not left to fire later", () => {
  savePendingAnswer(answer);
  takePendingAnswer(Date.now() + PENDING_ANSWER_TTL_MS + 1000);
  assert.equal(takePendingAnswer(), null);
});

test("junk in storage is ignored rather than thrown", () => {
  storage.setItem("bhirot:pending-answer", "{not json");
  assert.equal(takePendingAnswer(), null);
});

test("a record missing what a trade needs is not a trade", () => {
  storage.setItem("bhirot:pending-answer", JSON.stringify({ side: "YES", stake: 20, at: Date.now() }));
  assert.equal(takePendingAnswer(), null);
  storage.setItem("bhirot:pending-answer", JSON.stringify({ ...answer, side: "MAYBE", at: Date.now() }));
  assert.equal(takePendingAnswer(), null);
});

test("clearing leaves nothing behind", () => {
  savePendingAnswer(answer);
  clearPendingAnswer();
  assert.equal(takePendingAnswer(), null);
});

test("storage that throws never breaks the trip to login", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  storage = broken as unknown as MemoryStorage;
  savePendingAnswer(answer);
  assert.equal(takePendingAnswer(), null);
});

if (failures.length) {
  console.error(`\npending-answer: ${failures.length} failed\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`pending-answer: ${passed} tests passed`);
