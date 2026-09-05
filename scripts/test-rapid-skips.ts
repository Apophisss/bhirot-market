/**
 * Checks the memory behind "דלג" in מצב זריז (src/lib/rapid-skips.ts).
 *
 * A skip used to be a scroll: the deck moved on and nothing was written down, so
 * the next visit opened on the very question the user had waved away — first
 * card, every time. The browser's list is one of the two records that fixed that
 * (the other is the `rapid_skip` table, which needs a database and is exercised
 * by the app itself), and it has to keep four promises:
 *
 *   1. a question that was skipped is not offered again after a reload;
 *   2. a skip made *during* a run does not remove its own card from that run —
 *      the deck must not renumber itself under the finger that made the skip;
 *   3. the same skip is reported to the server once, not once per pass;
 *   4. the list stays bounded, and a browser with no storage at all still works.
 *
 * The store reads `window.localStorage` at call time, so a plain object standing
 * in for `window` is enough to test it exactly as the deck uses it.
 *
 *   npm run test:rapid
 *
 * Exits 1 on the first violations and prints the failing cases.
 */
import {
  SKIP_STORE_LIMIT,
  SKIP_TTL_MS,
  addSkips,
  clearSkips,
  mergeSkips,
  openSkipSnapshot,
  pruneSkips,
  readSkips,
  resetSkipCache,
  serverSkipSnapshot,
  skipSnapshot,
  subscribeSkipSnapshot,
  type RapidSkip,
} from "../src/lib/rapid-skips";

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

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 5, 9, 0, 0);

/* ---------------------------------------------------------- the pure parts -- */

check("an empty list prunes to an empty list", pruneSkips([], T0).length === 0);

const aged: RapidSkip[] = [
  { id: "old", ts: T0 - SKIP_TTL_MS - DAY },
  { id: "fresh", ts: T0 - DAY },
];
check("a skip past its expiry is forgotten", pruneSkips(aged, T0).map((s) => s.id).join() === "fresh", pruneSkips(aged, T0));

const unsorted: RapidSkip[] = [
  { id: "b", ts: T0 - 10 },
  { id: "a", ts: T0 - 100 },
];
check("the list comes back oldest first", pruneSkips(unsorted, T0).map((s) => s.id).join() === "a,b");

const overflowing = Array.from({ length: SKIP_STORE_LIMIT + 50 }, (_, i) => ({ id: `q${i}`, ts: T0 - (SKIP_STORE_LIMIT + 50 - i) * 1000 }));
const capped = pruneSkips(overflowing, T0);
check("the list is capped", capped.length === SKIP_STORE_LIMIT, capped.length);
check("and it is the newest skips that survive the cap", capped[capped.length - 1].id === `q${SKIP_STORE_LIMIT + 49}`);
check("the oldest are the ones dropped", capped[0].id === `q50`, capped[0]);

const merged = mergeSkips([{ id: "a", ts: T0 - 1000 }], ["a", "b", "b", ""], T0);
check("merging skips is idempotent per question", merged.map((s) => s.id).join() === "a,b", merged);
check("a re-skip keeps the moment of the first one", merged.find((s) => s.id === "a")!.ts === T0 - 1000, merged);
check("and an empty id is not a question", !merged.some((s) => !s.id));

// a question re-skipped on every pass must not be able to outlive the expiry
let carried: RapidSkip[] = mergeSkips([], ["forever"], T0);
for (let i = 1; i <= 10; i++) carried = mergeSkips(carried, ["forever"], T0 + i * DAY);
check("re-skipping does not refresh the clock", carried[0].ts === T0, carried);
check("so an old skip does expire", mergeSkips(carried, ["forever"], T0 + SKIP_TTL_MS + DAY).length === 1);

/* --------------------------------------------------------------- the store -- */

/** The browser, as far as this module is concerned. */
function fakeWindow(store = new Map<string, string>()) {
  return {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    store,
  };
}

const browser = fakeWindow();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = browser;

/** A fresh page load: the module's caches are gone, storage is not. */
function reload() {
  resetSkipCache();
}

clearSkips();
reload();

// ---- one run: the deck asks for what to hide, then skips three questions -----

const deck = ["q1", "q2", "q3", "q4", "q5"];
openSkipSnapshot(T0);
const runOne = skipSnapshot();
check("a browser that never skipped hides nothing", runOne.size === 0);
check("and the deck it is served is the whole deck", deck.filter((id) => !runOne.has(id)).length === 5);

check("the first skip is news", addSkips(["q1"], T0).join() === "q1");
check("the same skip is not news twice", addSkips(["q1"], T0 + 1000).length === 0);
check("two more skips are reported once each", addSkips(["q2", "q3", "q2"], T0 + 2000).join() === "q2,q3");

// promise 2: the run the skips were made in does not lose the cards
check("a skip does not change the deck it was made in", skipSnapshot() === runOne, [...skipSnapshot()]);
check("the run still has all five cards", deck.filter((id) => !skipSnapshot().has(id)).length === 5);

// ---- the next visit --------------------------------------------------------

reload();
openSkipSnapshot(T0 + 3000);
const runTwo = skipSnapshot();
check("the skipped questions are remembered", [...runTwo].sort().join() === "q1,q2,q3", [...runTwo]);
check("and the next deck is what is left", deck.filter((id) => !runTwo.has(id)).join() === "q4,q5");
check("a reload reads the same list back", readSkips(T0 + 3000).length === 3);

// the snapshot notifies whoever is mounted, which is how the deck re-renders
let notified = 0;
const stop = subscribeSkipSnapshot(() => notified++);
addSkips(["q4"], T0 + 4000);
check("adding a skip does not disturb the mounted deck", notified === 0);
openSkipSnapshot(T0 + 5000);
check("opening a new deck does", notified === 1);
check("and it sees the skip made in the previous run", skipSnapshot().has("q4"));
openSkipSnapshot(T0 + 6000);
check("an unchanged list does not fire again", notified === 1);
stop();

// ---- putting them back ------------------------------------------------------

clearSkips();
check("clearing puts every question back on the table", skipSnapshot().size === 0 && readSkips(T0).length === 0);
check("and it is gone from storage too", !browser.store.has("bhirot:rapid:skipped"));

// ---- expiry, across a reload ------------------------------------------------

addSkips(["ancient"], T0);
reload();
check("a skip older than its expiry does not come back", readSkips(T0 + SKIP_TTL_MS + DAY).length === 0);
reload();
check("but before that it does", readSkips(T0 + DAY).map((s) => s.id).join() === "ancient");

// ---- the cap holds through the store ---------------------------------------

clearSkips();
for (let i = 0; i < SKIP_STORE_LIMIT + 40; i++) addSkips([`m${i}`], T0 + i);
check("the stored list is capped too", readSkips(T0 + 100_000).length === SKIP_STORE_LIMIT);
reload();
openSkipSnapshot(T0 + 100_000);
check("the newest skips are the ones that survived", skipSnapshot().has(`m${SKIP_STORE_LIMIT + 39}`));
check("and the oldest are gone", !skipSnapshot().has("m0"));

// ---- a browser with no storage at all --------------------------------------

clearSkips();
reload();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = {
  localStorage: {
    getItem() {
      throw new Error("private mode");
    },
    setItem() {
      throw new Error("private mode");
    },
    removeItem() {
      throw new Error("private mode");
    },
  },
};
check("a blocked store reads as 'nothing skipped'", readSkips(T0).length === 0);
check("and a skip in private mode does not throw", addSkips(["q9"], T0).join() === "q9");
check("it still holds for this run", readSkips(T0).map((s) => s.id).join() === "q9");
openSkipSnapshot(T0);
check("and the deck can still be opened", skipSnapshot().has("q9"));

check("the server never claims a skip it cannot know about", serverSkipSnapshot().size === 0);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ rapid skips: a skipped question does not come back, and does not vanish mid-run");
