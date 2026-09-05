/**
 * Tests for the Google Ads conversion ledger and ad attribution.
 *
 * The property that matters is exactly-once: Google bids on the conversion
 * count, so a signup reported twice quietly doubles the campaign's apparent
 * performance and drags the bid up with it. Runs against a throwaway SQLite
 * file so the guard is exercised as real SQL rather than a mock.
 *
 * Run: npm run test:ads   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-ads-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { claimAdAttribution, claimAdConversions, type AdConversion } from "../src/lib/ad-conversions";
import { parseAdAttribution, readAdParams, serializeAdAttribution } from "../src/lib/ad-attribution";

const { users, markets, trades } = schema;

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}: ${(err as Error).message.split("\n")[0]}`);
  }
}

const names = (events: AdConversion[]) => events.map((e) => e.name).sort();

async function main() {
  const db = await getDb();

  let seq = 0;
  const newUser = async () => {
    const [u] = await db.insert(users).values({ email: `u${seq++}@test.local`, name: "t" }).returning();
    return u.id;
  };

  await db.insert(markets).values({ id: "m1", title: "t", closesAt: new Date(Date.now() + 86_400_000) });
  const addTrade = (userId: string) =>
    db.insert(trades).values({
      userId,
      marketId: "m1",
      side: "YES",
      action: "BUY",
      shares: 1,
      amount: 1,
      priceBefore: 0.5,
      priceAfter: 0.5,
    });

  /* ---------------- reading the click ---------------- */

  await test("campaign params are read off the query string", () => {
    assert.deepEqual(readAdParams("?gclid=abc&utm_source=google&utm_campaign=generic"), {
      gclid: "abc",
      utmSource: "google",
      utmCampaign: "generic",
    });
  });

  await test("an ordinary query string leaves nothing to store", () => {
    assert.equal(readAdParams("?q=hello&page=2"), null);
  });

  await test("gbraid stands in for gclid when iOS strips it", () => {
    assert.equal(readAdParams("?gbraid=xyz")?.gclid, "xyz");
  });

  await test("attribution survives a serialize/parse round trip", () => {
    const attr = { gclid: "abc123", utmSource: "google", utmCampaign: "קמפיין" };
    assert.deepEqual(parseAdAttribution(serializeAdAttribution(attr)), attr);
  });

  await test("an oversized param is truncated rather than stored whole", () => {
    assert.equal(readAdParams(`?gclid=${"x".repeat(500)}`)?.gclid?.length, 200);
  });

  await test("a value that would break Set-Cookie is stripped", () => {
    // a semicolon would end the cookie early and let the rest be read as attributes
    assert.equal(readAdParams("?gclid=a;path=/;evil=1")?.gclid?.includes(";"), false);
  });

  /* ---------------- the ledger ---------------- */

  await test("a fresh user owes exactly the signup", async () => {
    assert.deepEqual(names(await claimAdConversions(await newUser())), ["sign_up"]);
  });

  await test("the signup is never reported twice", async () => {
    const id = await newUser();
    await claimAdConversions(id);
    assert.deepEqual(await claimAdConversions(id), []);
  });

  await test("concurrent calls hand the signup to exactly one of them", async () => {
    const id = await newUser();
    const results = await Promise.all([claimAdConversions(id), claimAdConversions(id), claimAdConversions(id)]);
    assert.equal(results.flat().filter((e) => e.name === "sign_up").length, 1);
  });

  await test("first_trade is withheld until a trade actually exists", async () => {
    const id = await newUser();
    assert.deepEqual(names(await claimAdConversions(id)), ["sign_up"]);
    await addTrade(id);
    assert.deepEqual(names(await claimAdConversions(id)), ["first_trade"]);
  });

  await test("further trades add no further conversions", async () => {
    const id = await newUser();
    await addTrade(id);
    await claimAdConversions(id);
    await addTrade(id);
    assert.deepEqual(await claimAdConversions(id), []);
  });

  await test("a user who trades before the first check owes both at once", async () => {
    const id = await newUser();
    await addTrade(id);
    assert.deepEqual(names(await claimAdConversions(id)), ["first_trade", "sign_up"]);
  });

  await test("a trade outweighs a signup, and both carry a value", async () => {
    const id = await newUser();
    await addTrade(id);
    const events = await claimAdConversions(id);
    assert.ok(events.every((e) => e.value > 0), "every conversion needs a value");
    const signup = events.find((e) => e.name === "sign_up")!.value;
    const trade = events.find((e) => e.name === "first_trade")!.value;
    assert.ok(trade > signup, `first_trade (${trade}) must outweigh sign_up (${signup})`);
  });

  await test("an unknown user id is not an error", async () => {
    assert.deepEqual(await claimAdConversions("does-not-exist"), []);
  });

  /* ---------------- attribution on the user row ---------------- */

  await test("the click that brought a user in is stamped on them", async () => {
    const id = await newUser();
    await claimAdAttribution(id, serializeAdAttribution({ gclid: "click-1", utmSource: "google", utmCampaign: "generic" }));
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    assert.equal(row?.gclid, "click-1");
    assert.equal(row?.utmCampaign, "generic");
  });

  await test("a later click never overwrites the one that earned the account", async () => {
    const id = await newUser();
    await claimAdAttribution(id, serializeAdAttribution({ gclid: "first" }));
    await claimAdAttribution(id, serializeAdAttribution({ gclid: "second" }));
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    assert.equal(row?.gclid, "first");
  });

  await test("a visitor who arrived without a campaign is left untouched", async () => {
    const id = await newUser();
    await claimAdAttribution(id, undefined);
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    assert.equal(row?.gclid, null);
  });

  if (failures.length) {
    console.error(`\nad-conversions: ${failures.length} failed\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`ad-conversions: ${passed} tests passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
