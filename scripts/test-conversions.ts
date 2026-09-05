/**
 * Tests for the ad-conversion ledger.
 *
 * The property that matters is exactly-once: Google bids on the conversion
 * count, so a signup reported twice quietly doubles the campaign's apparent
 * performance and drags the bid up with it. Runs against a throwaway SQLite
 * file so the guard is exercised as real SQL, not as a mock.
 *
 * Run: npm test
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-conv-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { claimConversions } from "../src/lib/conversions";
import { parseAttribution, readAttribution, serializeAttribution } from "../src/lib/analytics";

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

const names = (events: { name: string }[]) => events.map((e) => e.name).sort();

async function main() {
  const db = await getDb();

  let seq = 0;
  const newUser = async () => {
    const [u] = await db.insert(users).values({ email: `u${seq++}@test.local`, name: "t" }).returning();
    return u.id;
  };

  await db.insert(markets).values({
    id: "m1",
    title: "t",
    closesAt: new Date(Date.now() + 86_400_000),
  });
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

  /* ---------------- attribution parsing ---------------- */

  await test("gclid is read off the query string", () => {
    assert.deepEqual(readAttribution("?gclid=abc&utm_source=google&utm_campaign=generic"), {
      gclid: "abc",
      utmSource: "google",
      utmCampaign: "generic",
    });
  });

  await test("a query string with no campaign params yields nothing to store", () => {
    assert.equal(readAttribution("?q=hello&page=2"), null);
  });

  await test("gbraid stands in for gclid when iOS strips it", () => {
    assert.equal(readAttribution("?gbraid=xyz")?.gclid, "xyz");
  });

  await test("attribution survives a serialize/parse round trip", () => {
    const attr = { gclid: "a b/c", utmSource: "google", utmCampaign: "קמפיין" };
    assert.deepEqual(parseAttribution(serializeAttribution(attr)), attr);
  });

  await test("an oversized param is truncated rather than stored whole", () => {
    assert.equal(readAttribution(`?gclid=${"x".repeat(500)}`)?.gclid?.length, 200);
  });

  /* ---------------- the ledger ---------------- */

  await test("a fresh user owes exactly the signup", async () => {
    const id = await newUser();
    assert.deepEqual(names(await claimConversions(id)), ["sign_up"]);
  });

  await test("the signup is never reported twice", async () => {
    const id = await newUser();
    await claimConversions(id);
    assert.deepEqual(await claimConversions(id), []);
  });

  await test("concurrent calls hand the signup to exactly one of them", async () => {
    const id = await newUser();
    const results = await Promise.all([claimConversions(id), claimConversions(id), claimConversions(id)]);
    assert.equal(results.flat().filter((e) => e.name === "sign_up").length, 1);
  });

  await test("first_trade is withheld until a trade actually exists", async () => {
    const id = await newUser();
    assert.deepEqual(names(await claimConversions(id)), ["sign_up"]);
    await addTrade(id);
    assert.deepEqual(names(await claimConversions(id)), ["first_trade"]);
  });

  await test("further trades add no further conversions", async () => {
    const id = await newUser();
    await addTrade(id);
    await claimConversions(id);
    await addTrade(id);
    assert.deepEqual(await claimConversions(id), []);
  });

  await test("a user who trades before the first check owes both at once", async () => {
    const id = await newUser();
    await addTrade(id);
    assert.deepEqual(names(await claimConversions(id)), ["first_trade", "sign_up"]);
  });

  await test("both conversions carry a value, and a trade is worth more", async () => {
    const id = await newUser();
    await addTrade(id);
    const events = await claimConversions(id);
    assert.ok(events.every((e) => (e.value ?? 0) > 0), "every conversion needs a value");
    const signup = events.find((e) => e.name === "sign_up")!.value!;
    const trade = events.find((e) => e.name === "first_trade")!.value!;
    assert.ok(trade > signup, `first_trade (${trade}) must outweigh sign_up (${signup})`);
  });

  await test("the click that paid for a signup is stamped on the user", async () => {
    const id = await newUser();
    await claimConversions(id, { gclid: "click-1", utmSource: "google", utmCampaign: "generic" });
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    assert.equal(row?.gclid, "click-1");
    assert.equal(row?.utmCampaign, "generic");
  });

  await test("a later click never overwrites the one that converted", async () => {
    const id = await newUser();
    await claimConversions(id, { gclid: "first" });
    await db.update(users).set({ signupReportedAt: null }).where(eq(users.id, id));
    await claimConversions(id, { gclid: "second" });
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    assert.equal(row?.gclid, "first");
  });

  await test("an unknown user id is not an error", async () => {
    assert.deepEqual(await claimConversions("does-not-exist"), []);
  });

  if (failures.length) {
    console.error(`\nconversions: ${failures.length} failed\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`conversions: ${passed} tests passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
