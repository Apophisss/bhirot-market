/**
 * Tests for the fan-out that puts the site's own events into GA4.
 *
 * Run against the real `gaEvent`, with a stub `window` standing in for the
 * browser: what is asserted is what would actually land in `dataLayer`, not what
 * a mock says was intended. The mapping is where the reports live or die — a
 * parameter under the wrong name is not an error anywhere, it is a column of
 * "(not set)" in GA a week later, which is the same silence this whole change
 * set exists to fix.
 *
 * Run: npm run test:ga   (also part of `npm test`)
 */
import assert from "node:assert/strict";

/**
 * `gaEnabled` is decided when `gtag.ts` loads, and esbuild hoists the import
 * below above anything written here — so the measurement ID is set by the npm
 * script (`test:ga`), not in this file. `window` is only read when an event is
 * sent, so the stub can be installed here.
 */
interface FakeWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}
const fakeWindow: FakeWindow = {};
(globalThis as { window?: FakeWindow }).window = fakeWindow;

import { forwardToGa } from "../src/lib/ga-bridge";
import { EVENTS } from "../src/lib/events";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fakeWindow.dataLayer = [];
    delete fakeWindow.gtag;
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}: ${(err as Error).message.split("\n")[0]}`);
  }
}

/** What gtag.js would drain: ["event", name, params]. */
function sent(): [string, Record<string, unknown>][] {
  return (fakeWindow.dataLayer ?? [])
    .map((a) => Array.from(a as ArrayLike<unknown>))
    .filter((a) => a[0] === "event")
    .map((a) => [a[1] as string, (a[2] ?? {}) as Record<string, unknown>]);
}

test("an event reaches GA4 under its own name", () => {
  forwardToGa("share", { marketId: "m1", props: { path: "/market/x" } });
  assert.deepEqual(sent(), [["share", { market_id: "m1", path: "/market/x" }]]);
});

test("page views are not forwarded — GA4 already sends its own", () => {
  forwardToGa("pageview", { props: { title: "x" } });
  assert.deepEqual(sent(), []);
});

test("`value` never reaches GA4 under that name", () => {
  // GA4 reads `value` as revenue, and the money here is virtual
  forwardToGa("trade_attempt", { marketId: "m1", value: 250 });
  assert.deepEqual(sent(), [["trade_attempt", { market_id: "m1", amount: 250 }]]);
});

test("time on page is reported in seconds, not milliseconds", () => {
  forwardToGa("page_exit", { value: 12_400, props: { scroll: 0.5 } });
  assert.deepEqual(sent(), [["page_exit", { seconds: 12, scroll: 0.5 }]]);
});

test("a web vital keeps its own measurement", () => {
  forwardToGa("web_vital", { value: 1834, props: { metric: "LCP", rating: "good" } });
  assert.deepEqual(sent(), [["web_vital", { metric_value: 1834, metric: "LCP", rating: "good" }]]);
});

test("a search term lands where GA4's own search report reads it", () => {
  forwardToGa("search", { props: { q: "ביבי" } });
  assert.deepEqual(sent(), [["search", { search_term: "ביבי" }]]);
});

test("props are snake_cased, the way GA4 reports read", () => {
  forwardToGa("trade_attempt", { props: { loggedIn: 1, side: "YES" } });
  assert.deepEqual(sent(), [["trade_attempt", { logged_in: 1, side: "YES" }]]);
});

test("a nested or empty prop is dropped rather than stringified into noise", () => {
  forwardToGa("click", { props: { id: "x", junk: { a: 1 }, nothing: null, blank: "" } });
  assert.deepEqual(sent(), [["click", { id: "x" }]]);
});

test("long values are truncated to what GA4 accepts", () => {
  forwardToGa("outbound", { props: { href: "h".repeat(300) } });
  const [, params] = sent()[0];
  assert.equal((params.href as string).length, 100);
});

test("a flood of props cannot exceed GA4's per-event cap", () => {
  const props = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
  forwardToGa("click", { props });
  assert.ok(Object.keys(sent()[0][1]).length <= 25, "more parameters than GA4 accepts");
});

test("every event the site records today is forwarded", () => {
  // the catalogue minus `pageview`, read from the catalogue itself: a hand-written
  // list silently stopped covering the events added after it was written
  const names = Object.values(EVENTS).filter((n) => n !== EVENTS.pageview);
  assert.ok(names.includes("guest_answer") && names.includes("landing"), "the catalogue is the source");
  for (const n of names) forwardToGa(n, {});
  assert.deepEqual(sent().map(([n]) => n), names);
});

if (failures.length) {
  console.error(`\n${failures.length} failed:\n` + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log(`ga bridge: ${passed} tests passed`);
