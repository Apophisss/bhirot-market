/**
 * Tests for the pieces the admin dashboard and the public forms depend on:
 * the access allowlist, the Israel-time conversion a deadline goes through,
 * the slug a new question gets, and the rate limiter in front of the forms.
 * No framework — plain assertions so it runs anywhere `tsx` runs. Run: npm test
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  adminCookieValid,
  adminCookieValue,
  adminEmails,
  adminOpenInDev,
  adminTokenConfigured,
  checkAdminToken,
} from "../src/lib/admin";
import { isAuthorizedAdmin } from "../src/lib/api-auth";
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

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/* ---------- who may reach the dashboard ---------- */

test("an empty allowlist names nobody", () => {
  withEnv({ ADMIN_EMAILS: undefined }, () => assert.deepEqual(adminEmails(), []));
  withEnv({ ADMIN_EMAILS: "  " }, () => assert.deepEqual(adminEmails(), []));
  withEnv({ ADMIN_EMAILS: " , ," }, () => assert.deepEqual(adminEmails(), []));
});

test("the allowlist is lower-cased and trimmed, so a typo in spacing still matches", () => {
  withEnv({ ADMIN_EMAILS: "Editor@Example.com,  second@example.com ," }, () => {
    assert.deepEqual(adminEmails(), ["editor@example.com", "second@example.com"]);
    // the comparison in isAdmin() lower-cases the session email against exactly this list
    assert.equal(adminEmails().includes("editor@example.com"), true);
    for (const near of ["editor@example.com.evil.com", "xeditor@example.com", "editor@example.co"]) {
      assert.equal(adminEmails().includes(near), false, `${near} must not be an admin`);
    }
  });
});

test("the admin token comparison accepts only the exact token", () => {
  withEnv({ ADMIN_TOKEN: "s3cret-token" }, () => {
    assert.equal(adminTokenConfigured(), true);
    assert.equal(checkAdminToken("s3cret-token"), true);
    for (const wrong of ["s3cret-toke", "s3cret-token ", "S3CRET-TOKEN", "", "x"]) {
      assert.equal(checkAdminToken(wrong), false, `${JSON.stringify(wrong)} must be rejected`);
    }
  });
});

test("with no token configured nothing authenticates", () => {
  withEnv({ ADMIN_TOKEN: undefined }, () => {
    assert.equal(adminTokenConfigured(), false);
    assert.equal(checkAdminToken(""), false);
    assert.equal(checkAdminToken("anything"), false);
  });
});

test("the dashboard is open locally only when neither gate is configured", () => {
  withEnv({ ADMIN_TOKEN: undefined, ADMIN_EMAILS: undefined, NODE_ENV: "development" }, () =>
    assert.equal(adminOpenInDev(), true),
  );
  withEnv({ ADMIN_TOKEN: "t", ADMIN_EMAILS: undefined, NODE_ENV: "development" }, () =>
    assert.equal(adminOpenInDev(), false),
  );
  withEnv({ ADMIN_TOKEN: undefined, ADMIN_EMAILS: "a@b.com", NODE_ENV: "development" }, () =>
    assert.equal(adminOpenInDev(), false),
  );
  // production is never open, however empty the configuration is
  withEnv({ ADMIN_TOKEN: undefined, ADMIN_EMAILS: undefined, NODE_ENV: "production" }, () =>
    assert.equal(adminOpenInDev(), false),
  );
});

test("a bearer token authenticates only when it is the token itself", () => {
  const req = (auth: string) => new Request("https://bhirot-market.com/api/admin/bundle", { headers: { authorization: auth } });
  withEnv({ ADMIN_TOKEN: "s3cret-token", CRON_SECRET: "cron-secret" }, () => {
    assert.equal(isAuthorizedAdmin(req("Bearer s3cret-token")), true);
    assert.equal(isAuthorizedAdmin(req("bearer s3cret-token")), true, "the scheme is case-insensitive");
    for (const wrong of ["Bearer s3cret-toke", "Bearer s3cret-tokenx", "Bearer S3CRET-TOKEN", "Bearer ", "s3cret-token"]) {
      assert.equal(isAuthorizedAdmin(req(wrong)), false, `${JSON.stringify(wrong)} must be rejected`);
    }
    // the cron secret opens the cron endpoints and nothing else
    assert.equal(isAuthorizedAdmin(req("Bearer cron-secret")), false);
    assert.equal(isAuthorizedAdmin(req("Bearer cron-secret"), { allowCron: true }), true);
  });
  // with nothing configured, no token is the right token
  withEnv({ ADMIN_TOKEN: undefined, CRON_SECRET: undefined }, () => {
    assert.equal(isAuthorizedAdmin(req("Bearer anything")), false);
    assert.equal(isAuthorizedAdmin(req("Bearer anything"), { allowCron: true }), false);
  });
});

/* ---------- the admin cookie ages out on its own ---------- */

const DAY = 86_400_000;

test("a cookie this server signed is accepted", () => {
  withEnv({ ADMIN_TOKEN: "s3cret-token" }, () => {
    const value = adminCookieValue();
    assert.ok(value);
    assert.equal(adminCookieValid(value), true);
    // the token itself is never in the cookie
    assert.equal(value!.includes("s3cret-token"), false);
  });
});

test("a cookie stops working after thirty days", () => {
  withEnv({ ADMIN_TOKEN: "s3cret-token" }, () => {
    const issued = Date.parse("2026-09-01T10:00:00Z");
    const value = adminCookieValue(issued)!;
    assert.equal(adminCookieValid(value, issued + 29 * DAY), true, "still inside the window");
    assert.equal(adminCookieValid(value, issued + 31 * DAY), false, "a copied cookie does not last forever");
    // and a stamp from the future is not a clock problem, it is a made-up stamp
    assert.equal(adminCookieValid(value, issued - DAY), false);
  });
});

test("nothing but a cookie we signed verifies", () => {
  withEnv({ ADMIN_TOKEN: "s3cret-token" }, () => {
    const now = Date.parse("2026-09-06T10:00:00Z");
    const value = adminCookieValue(now)!;
    const [stamp, mac] = [value.slice(0, value.indexOf(".")), value.slice(value.indexOf(".") + 1)];
    // moving the issue date forward to buy another month breaks the signature
    assert.equal(adminCookieValid(`${Number(stamp) + 10 * 86_400}.${mac}`, now), false);
    for (const bad of ["", ".", "abc", `${stamp}.`, `${stamp}.${mac.slice(0, -1)}`, mac]) {
      assert.equal(adminCookieValid(bad, now), false, `${JSON.stringify(bad)} must be rejected`);
    }
    // the previous scheme — an HMAC of a constant, valid until the token rotated
    const legacy = createHmac("sha256", "s3cret-token").update("bhirot-admin-v1").digest("hex");
    assert.equal(adminCookieValid(legacy, now), false, "a cookie with no issue date is no longer accepted");
    // a cookie minted with a different token is not ours either
    const other = withCookieFrom("another-token", now);
    assert.equal(adminCookieValid(other, now), false);
  });
  // and with no token configured there is nothing to verify against
  withEnv({ ADMIN_TOKEN: undefined }, () => {
    assert.equal(adminCookieValue(), null);
    assert.equal(adminCookieValid("1757152800.deadbeef"), false);
  });
});

/** A cookie as it would be signed by a server holding a different ADMIN_TOKEN. */
function withCookieFrom(token: string, now: number): string {
  let value = "";
  withEnv({ ADMIN_TOKEN: token }, () => {
    value = adminCookieValue(now)!;
  });
  return value;
}

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

test("a contact message needs an address, a title and some text", () => {
  const ok = { email: "a@b.com", subject: "טעות בשוק", body: "שלום, יש טעות בשוק" };
  assert.equal(ContactInputSchema.safeParse(ok).success, true);
  assert.equal(ContactInputSchema.safeParse({ ...ok, email: "not-an-email" }).success, false);
  assert.equal(ContactInputSchema.safeParse({ ...ok, body: "קצר" }).success, false);
  // the title is what makes the inbox scannable, so an empty or one-letter one is rejected
  assert.equal(ContactInputSchema.safeParse({ ...ok, subject: "" }).success, false);
  assert.equal(ContactInputSchema.safeParse({ ...ok, subject: "x".repeat(121) }).success, false);
  // the error reaches the visitor verbatim, so it has to be in Hebrew even when the field is absent
  const missing = ContactInputSchema.safeParse({ email: ok.email, body: ok.body });
  assert.match(missing.success ? "" : (missing.error.issues[0]?.message ?? ""), /[\u0590-\u05FF]/);
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
