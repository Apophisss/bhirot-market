/**
 * Tests for the pieces the admin dashboard and the public forms depend on:
 * the access allowlist, the Israel-time conversion a deadline goes through,
 * the slug a new question gets, and the rate limiter in front of the forms.
 * No framework — plain assertions so it runs anywhere `tsx` runs. Run: npm test
 */
import assert from "node:assert/strict";
import { adminEmails, isAdminEmail } from "../src/lib/admin";
import { israelLocalToIso, israelOffsetMinutes, isoToIsraelLocal } from "../src/lib/il-time";
import { fallbackSlug, slugify, suggestSlug } from "../src/lib/slug";
import { rateLimit } from "../src/lib/rate-limit";
import { ContactInputSchema, SuggestionInputSchema } from "../src/lib/inbox";

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

function withEnv(value: string | undefined, fn: () => void) {
  const before = process.env.ADMIN_EMAILS;
  if (value === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = before;
  }
}

/* ---------- the allowlist ---------- */

test("an empty allowlist lets nobody in", () => {
  withEnv(undefined, () => {
    assert.equal(adminEmails().length, 0);
    assert.equal(isAdminEmail("anyone@example.com"), false);
  });
  withEnv("  ", () => assert.equal(isAdminEmail("anyone@example.com"), false));
});

test("membership ignores case, spacing and the separator used", () => {
  withEnv("Editor@Example.com, second@example.com;third@example.com", () => {
    assert.deepEqual(adminEmails(), ["editor@example.com", "second@example.com", "third@example.com"]);
    assert.equal(isAdminEmail("EDITOR@example.com"), true);
    assert.equal(isAdminEmail(" second@example.com "), true);
    assert.equal(isAdminEmail("third@example.com"), true);
  });
});

test("a near-miss address is not an admin", () => {
  withEnv("editor@example.com", () => {
    for (const email of ["editor@example.com.evil.com", "xeditor@example.com", "editor@example.co", "", null, undefined]) {
      assert.equal(isAdminEmail(email as string | null | undefined), false, `${email} must not be an admin`);
    }
  });
});

/* ---------- deadlines in Israel time ---------- */

test("Israel is UTC+3 in summer and UTC+2 in winter", () => {
  assert.equal(israelOffsetMinutes(new Date("2026-07-01T09:00:00Z")), 180);
  assert.equal(israelOffsetMinutes(new Date("2026-01-01T09:00:00Z")), 120);
});

test("a datetime-local value is read as Israel wall-clock time", () => {
  // 20:59 in July is 17:59 UTC, in January it is 18:59 UTC
  assert.equal(israelLocalToIso("2026-07-15T20:59"), "2026-07-15T17:59:00.000Z");
  assert.equal(israelLocalToIso("2026-01-15T20:59"), "2026-01-15T18:59:00.000Z");
  assert.equal(israelLocalToIso("2026-07-15T20:59:59"), "2026-07-15T17:59:59.000Z");
});

test("a value that already carries a zone is kept as the instant it names", () => {
  assert.equal(israelLocalToIso("2026-09-15T20:59:59+03:00"), "2026-09-15T17:59:59.000Z");
  assert.equal(israelLocalToIso("2026-09-15T17:59:59Z"), "2026-09-15T17:59:59.000Z");
});

test("garbage in, null out", () => {
  for (const bad of ["", "   ", "לא תאריך", "2026-13-45T99:99"]) {
    assert.equal(israelLocalToIso(bad), null, `${bad} is not a date`);
  }
});

test("the local <-> ISO conversion round-trips", () => {
  for (const local of ["2026-07-15T20:59", "2026-01-15T20:59", "2026-03-27T23:30", "2026-10-30T00:30"]) {
    const iso = israelLocalToIso(local);
    assert.ok(iso, `${local} should parse`);
    assert.equal(isoToIsraelLocal(iso), local, `${local} should survive the round trip`);
  }
});

/* ---------- slugs ---------- */

test("a slug is ascii kebab-case", () => {
  assert.equal(slugify("Netanyahu Poll 30 Seats"), "netanyahu-poll-30-seats");
  assert.equal(slugify("  --Mixed__Case!!  "), "mixed-case");
  assert.equal(slugify("האם נתניהו יעיד?"), "");
  assert.ok(slugify("a".repeat(200)).length <= 70);
});

test("a Hebrew-only title falls back to a generated slug", () => {
  const s = suggestSlug("האם הכנסת תאשר את חוק הגיוס עד 30.11?", new Date("2026-09-05T00:00:00Z"));
  assert.match(s, /^q-20260905-[a-z0-9]{4}$/);
  assert.notEqual(fallbackSlug(new Date(), 0.1), fallbackSlug(new Date(), 0.9));
});

test("a title with enough ascii keeps its own slug", () => {
  assert.equal(suggestSlug("Likud 30 seats channel 14 poll"), "likud-30-seats-channel-14-poll");
});

/* ---------- rate limiting ---------- */

test("the limiter allows the quota and then blocks", () => {
  const key = `test:${Math.random()}`;
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rateLimit(key, 5, 60_000, t0).ok, true, `hit ${i + 1} should pass`);
  const blocked = rateLimit(key, 5, 60_000, t0);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60);
  // once the window has rolled past, the quota is back
  assert.equal(rateLimit(key, 5, 60_000, t0 + 60_001).ok, true);
});

test("two clients do not share a quota", () => {
  const a = `a:${Math.random()}`;
  const b = `b:${Math.random()}`;
  for (let i = 0; i < 5; i++) rateLimit(a, 5, 60_000, 2_000_000);
  assert.equal(rateLimit(a, 5, 60_000, 2_000_000).ok, false);
  assert.equal(rateLimit(b, 5, 60_000, 2_000_000).ok, true);
});

/* ---------- what the public forms accept ---------- */

test("a contact message needs a real address and some text", () => {
  assert.equal(ContactInputSchema.safeParse({ email: "a@b.com", body: "שלום, יש טעות בשוק" }).success, true);
  assert.equal(ContactInputSchema.safeParse({ email: "not-an-email", body: "שלום, יש טעות בשוק" }).success, false);
  assert.equal(ContactInputSchema.safeParse({ email: "a@b.com", body: "קצר" }).success, false);
});

test("a suggestion needs a question, and its image must be a path or https", () => {
  const base = { title: "האם הכנסת תאשר את חוק הגיוס עד 30.11?" };
  assert.equal(SuggestionInputSchema.safeParse(base).success, true);
  assert.equal(SuggestionInputSchema.safeParse({ ...base, title: "קצר" }).success, false);
  assert.equal(SuggestionInputSchema.safeParse({ ...base, imageUrl: "/covers/polls.svg" }).success, true);
  assert.equal(SuggestionInputSchema.safeParse({ ...base, imageUrl: "https://example.com/a.jpg" }).success, true);
  assert.equal(SuggestionInputSchema.safeParse({ ...base, imageUrl: "javascript:alert(1)" }).success, false);
  assert.equal(SuggestionInputSchema.safeParse({ ...base, probability: 120 }).success, false);
  assert.equal(SuggestionInputSchema.safeParse({ ...base, category: "not-a-category" }).success, false);
});

console.log(`admin: ${passed} tests passed`);
