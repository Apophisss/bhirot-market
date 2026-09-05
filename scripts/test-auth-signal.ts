/**
 * Tests for the sign-in signal that GA4's `login` / `sign_up` events ride on.
 *
 * Two properties matter. First, the value has to survive a round trip through a
 * cookie unchanged — a signal the browser cannot parse is a sign-in that is
 * never reported, which is exactly the silence this whole mechanism exists to
 * fix. Second, nothing that is not a signal may come back as one: the value is
 * spliced into a Set-Cookie header on the way out and into a GA report on the
 * way in, and neither place tolerates junk.
 *
 * Run: npm run test:auth   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import { parseAuthSignal, serializeAuthSignal, AUTH_SIGNAL_MAX_AGE } from "../src/lib/auth-signal";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}: ${(err as Error).message.split("\n")[0]}`);
  }
}

test("a signup survives the round trip", () => {
  const value = serializeAuthSignal({ event: "sign_up", method: "google" });
  assert.equal(value, "sign_up~google");
  assert.deepEqual(parseAuthSignal(value), { event: "sign_up", method: "google" });
});

test("a returning login survives the round trip", () => {
  const value = serializeAuthSignal({ event: "login", method: "google" });
  assert.deepEqual(parseAuthSignal(value), { event: "login", method: "google" });
});

test("the development provider round-trips too", () => {
  const value = serializeAuthSignal({ event: "login", method: "dev" });
  assert.deepEqual(parseAuthSignal(value), { event: "login", method: "dev" });
});

test("the value needs no encoding, so the browser reads back what the server wrote", () => {
  const value = serializeAuthSignal({ event: "sign_up", method: "google" })!;
  assert.equal(encodeURIComponent(value), value);
});

test("an unknown event name is refused on both sides", () => {
  // @ts-expect-error deliberately outside the union: this is the runtime guard
  assert.equal(serializeAuthSignal({ event: "logout", method: "google" }), null);
  assert.equal(parseAuthSignal("logout~google"), null);
});

test("a method that would break the header is refused", () => {
  for (const method of ["goo gle", "goo;gle", "goo,gle", "google\n", "a".repeat(33), ""]) {
    assert.equal(serializeAuthSignal({ event: "login", method }), null, `serialized ${JSON.stringify(method)}`);
  }
});

test("junk in the cookie reports nothing", () => {
  for (const raw of ["", "login", "sign_up~", "~google", "login~goo;gle", "nonsense", "login~google~extra", "login:google"]) {
    assert.equal(parseAuthSignal(raw), null, `parsed ${JSON.stringify(raw)}`);
  }
  assert.equal(parseAuthSignal(undefined), null);
  assert.equal(parseAuthSignal(null), null);
});

test("the cookie outlives the redirect from Google but not the visit", () => {
  assert.ok(AUTH_SIGNAL_MAX_AGE >= 60, "too short to survive a slow round trip");
  assert.ok(AUTH_SIGNAL_MAX_AGE <= 30 * 60, "long enough to report a stale sign-in");
});

if (failures.length) {
  console.error(`\n${failures.length} failed:\n` + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log(`auth signal: ${passed} tests passed`);
