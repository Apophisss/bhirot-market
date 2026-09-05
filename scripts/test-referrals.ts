/**
 * Tests for the invite programme: minting codes, paying the bonus exactly once,
 * the cap, and keeping gifted money out of the P&L.
 *
 * Runs the real code (`src/lib/referral-program.ts`) against a throwaway SQLite file,
 * so the migration, the unique indexes and every balance update are exercised for real.
 *
 * Run: npx tsx scripts/test-referrals.ts   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

// the db module reads DATABASE_URL lazily, on the first getDb() — setting it
// here (before main runs) is enough to keep the tests off the real database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-referral-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { getDb, schema } from "../src/lib/db";
import { STARTING_BALANCE } from "../src/lib/db/schema";
import {
  claimReferral,
  findUserByReferralCode,
  getOrCreateReferralCode,
  getReferralEarnings,
  getReferralSummary,
} from "../src/lib/referral-program";
import { MAX_REFERRALS, REFERRAL_BONUS, generateReferralCode, normalizeReferralCode } from "../src/lib/referral";
import { getLeaderboard } from "../src/lib/portfolio";
import { initialState } from "../src/lib/lmsr";

const { users, markets, referrals, trades } = schema;

let db: Awaited<ReturnType<typeof getDb>>;

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}`);
    console.error(`      ${(err as Error).message.split("\n")[0]}`);
  }
}

let seq = 0;
async function makeUser(balance = STARTING_BALANCE) {
  const id = `u${++seq}`;
  await db.insert(users).values({ id, name: `סוחר ${id}`, email: `${id}@test.local`, balance });
  return id;
}
async function balanceOf(id: string) {
  const row = await db.query.users.findFirst({ where: eq(users.id, id) });
  return row!.balance;
}

async function main() {
  db = await getDb();

  /* ---------- codes ---------- */

  await test("a generated code is the advertised length, and drawn from the safe alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      assert.equal(code.length, 7);
      assert.match(code, /^[23456789abcdefghjkmnpqrstuvwxyz]+$/, `${code} left the alphabet`);
    }
  });

  await test("codes do not repeat over a large draw", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateReferralCode()));
    assert.ok(seen.size > 1990, `only ${seen.size}/2000 distinct codes`);
  });

  await test("normalize accepts the shapes a shared link arrives in", () => {
    assert.equal(normalizeReferralCode("ab3d5fg"), "ab3d5fg");
    assert.equal(normalizeReferralCode("AB3D5FG"), "ab3d5fg");
    assert.equal(normalizeReferralCode(" ab3d5fg/ "), "ab3d5fg");
    assert.equal(normalizeReferralCode("ab3d5fg?utm_source=whatsapp"), "ab3d5fg");
    assert.equal(normalizeReferralCode("ab3d5fg#top"), "ab3d5fg");
  });

  await test("normalize rejects anything that could never be a code", () => {
    for (const bad of [null, undefined, "", "ab", "a".repeat(17), "ab_3d5", "../../etc", "שלום"]) {
      assert.equal(normalizeReferralCode(bad), null, `accepted ${JSON.stringify(bad)}`);
    }
  });

  await test("a user's code is minted once and then stays put", async () => {
    const id = await makeUser();
    const first = await getOrCreateReferralCode(id);
    const second = await getOrCreateReferralCode(id);
    assert.equal(first, second);
    const found = await findUserByReferralCode(first.toUpperCase());
    assert.equal(found?.id, id);
  });

  await test("two users never share a code", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) codes.add(await getOrCreateReferralCode(await makeUser()));
    assert.equal(codes.size, 25);
  });

  await test("an unknown code resolves to nobody", async () => {
    assert.equal(await findUserByReferralCode("zzzzzzz"), null);
    assert.equal(await findUserByReferralCode("not a code"), null);
  });

  /* ---------- claiming ---------- */

  await test("a claim pays the inviter and attributes the invitee", async () => {
    const inviter = await makeUser();
    const code = await getOrCreateReferralCode(inviter);
    const invitee = await makeUser();

    assert.equal(await claimReferral(invitee, code), "credited");
    assert.equal(await balanceOf(inviter), STARTING_BALANCE + REFERRAL_BONUS);
    // the invited account is untouched — it already got the standard starting balance
    assert.equal(await balanceOf(invitee), STARTING_BALANCE);
    const row = await db.query.users.findFirst({ where: eq(users.id, invitee) });
    assert.equal(row?.referredBy, inviter);
    assert.equal(await getReferralEarnings(inviter), REFERRAL_BONUS);
  });

  await test("a second claim on the same account pays nothing", async () => {
    const inviter = await makeUser();
    const code = await getOrCreateReferralCode(inviter);
    const other = await makeUser();
    const otherCode = await getOrCreateReferralCode(other);
    const invitee = await makeUser();

    assert.equal(await claimReferral(invitee, code), "credited");
    // a replay of the same link, and a second inviter trying to claim the same account
    assert.equal(await claimReferral(invitee, code), "none");
    assert.equal(await claimReferral(invitee, otherCode), "none");

    assert.equal(await balanceOf(inviter), STARTING_BALANCE + REFERRAL_BONUS);
    assert.equal(await balanceOf(other), STARTING_BALANCE);
    const rows = await db.select().from(referrals).where(eq(referrals.invitedId, invitee));
    assert.equal(rows.length, 1);
  });

  await test("inviting yourself pays nothing", async () => {
    const id = await makeUser();
    const code = await getOrCreateReferralCode(id);
    assert.equal(await claimReferral(id, code), "none");
    assert.equal(await balanceOf(id), STARTING_BALANCE);
  });

  await test("an unknown, malformed or missing code is a no-op", async () => {
    const invitee = await makeUser();
    for (const bad of [null, "", "zzzzzzz", "!!", "a"]) {
      assert.equal(await claimReferral(invitee, bad), "none");
    }
    const row = await db.query.users.findFirst({ where: eq(users.id, invitee) });
    assert.equal(row?.referredBy, null);
  });

  await test("past the cap the invite is recorded but no longer paid", async () => {
    const inviter = await makeUser();
    const code = await getOrCreateReferralCode(inviter);
    for (let i = 0; i < MAX_REFERRALS; i++) {
      assert.equal(await claimReferral(await makeUser(), code), "credited");
    }
    const atCap = await balanceOf(inviter);
    assert.equal(atCap, STARTING_BALANCE + MAX_REFERRALS * REFERRAL_BONUS);

    const overflow = await makeUser();
    assert.equal(await claimReferral(overflow, code), "recorded");
    assert.equal(await balanceOf(inviter), atCap, "the cap must stop the payout");

    const summary = await getReferralSummary(inviter);
    assert.equal(summary.invited, MAX_REFERRALS + 1, "the invite still counts");
    assert.equal(summary.earned, MAX_REFERRALS * REFERRAL_BONUS);
    assert.equal(summary.remaining, 0);
    // the link still works: the friend is attributed even without a bonus
    const row = await db.query.users.findFirst({ where: eq(users.id, overflow) });
    assert.equal(row?.referredBy, inviter);
  });

  await test("the summary reports the friends, newest first", async () => {
    const inviter = await makeUser();
    const code = await getOrCreateReferralCode(inviter);
    const empty = await getReferralSummary(inviter);
    assert.equal(empty.invited, 0);
    assert.equal(empty.earned, 0);
    assert.equal(empty.remaining, MAX_REFERRALS);
    assert.equal(empty.code, code);

    for (let i = 0; i < 3; i++) await claimReferral(await makeUser(), code);
    const summary = await getReferralSummary(inviter);
    assert.equal(summary.invited, 3);
    assert.equal(summary.earned, 3 * REFERRAL_BONUS);
    assert.equal(summary.friends.length, 3);
    for (const f of summary.friends) assert.equal(f.bonus, REFERRAL_BONUS);
    const times = summary.friends.map((f) => f.joinedAt.getTime());
    assert.deepEqual([...times].sort((a, b) => b - a), times, "friends should come back newest first");
  });

  /* ---------- accounting ---------- */

  await test("bonus money counts in net worth but never in P&L", async () => {
    const inviter = await makeUser();
    const code = await getOrCreateReferralCode(inviter);
    await claimReferral(await makeUser(), code);

    // the leaderboard only ranks users who have traded, so give this one a trade
    const marketId = `m${++seq}`;
    const st = initialState(0.5, 2000);
    await db.insert(markets).values({
      id: marketId,
      title: `שוק ${marketId}`,
      closesAt: new Date(Date.now() + 86_400_000),
      liquidity: 2000,
      qYes: st.qYes,
      qNo: st.qNo,
      probability: 0.5,
    });
    await db.insert(trades).values({
      userId: inviter,
      marketId,
      side: "YES",
      action: "BUY",
      shares: 10,
      amount: 5,
      priceBefore: 0.5,
      priceAfter: 0.5,
    });

    const row = (await getLeaderboard()).find((r) => r.userId === inviter);
    assert.ok(row, "the inviter should be on the leaderboard");
    assert.equal(row.referralBonus, REFERRAL_BONUS);
    assert.equal(row.netWorth, STARTING_BALANCE + REFERRAL_BONUS, "the bonus is real money in the balance");
    assert.equal(row.pnl, 0, "…but it is capital, not a trading profit");
  });

  console.log(`referrals: ${passed} tests passed${failures.length ? `, ${failures.length} FAILED` : ""}`);
  if (failures.length) {
    console.error(`\n${failures.map((f) => `  ✗ ${f}`).join("\n\n")}\n`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
