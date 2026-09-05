/**
 * Tests for the friends system: finding people, asking, answering, and — the one that
 * matters most — what a friend is and is not allowed to see.
 *
 * Runs the real code (`src/lib/friends.ts`) against a throwaway SQLite file, so the
 * migration, the unique index on the pair and every state transition are exercised for
 * real.
 *
 * Run: npx tsx scripts/test-friends.ts   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

// the db module reads DATABASE_URL lazily, on the first getDb() — setting it
// here (before main runs) is enough to keep the tests off the real database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-friends-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { getDb, schema } from "../src/lib/db";
import { STARTING_BALANCE } from "../src/lib/db/schema";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  countIncomingRequests,
  declineFriendRequest,
  friendStats,
  friendsNotIn,
  getFriendIds,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  removeFriend,
  searchPeople,
  sendFriendRequest,
} from "../src/lib/friends";
import { FRIEND_STAT_FIELDS, MAX_PENDING_REQUESTS } from "../src/lib/social";
import { executeTrade } from "../src/lib/trade";
import { initialState } from "../src/lib/lmsr";

const { users, markets, friendships } = schema;

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
async function makeUser(name?: string) {
  const id = `u${++seq}`;
  await db.insert(users).values({ id, name: name ?? `שחקן ${id}`, email: `${id}@test.local` });
  return id;
}

async function makeMarket() {
  const id = `m${++seq}`;
  const st = initialState(0.5, 2000);
  await db.insert(markets).values({
    id,
    title: `שאלה ${id}`,
    closesAt: new Date(Date.now() + 86_400_000),
    liquidity: 2000,
    qYes: st.qYes,
    qNo: st.qNo,
    probability: 0.5,
  });
  return id;
}

/** Two users who accepted each other, the normal starting point for most tests. */
async function makeFriends() {
  const a = await makeUser();
  const b = await makeUser();
  await sendFriendRequest(a, b);
  await acceptFriendRequest(b, a);
  return [a, b] as const;
}

async function main() {
  db = await getDb();

  /* ---------- search ---------- */

  await test("search finds people by part of their name, and never the searcher", async () => {
    const me = await makeUser("דנה כהן");
    const other = await makeUser("דני לוי");
    const found = await searchPeople(me, "דנ");
    const ids = found.map((p) => p.id);
    assert.ok(ids.includes(other), "should find the other דנ…");
    assert.ok(!ids.includes(me), "the searcher must not be in their own results");
  });

  await test("a search shorter than the minimum returns nothing at all", async () => {
    const me = await makeUser("אבי");
    assert.deepEqual(await searchPeople(me, "א"), []);
    assert.deepEqual(await searchPeople(me, " "), []);
    assert.deepEqual(await searchPeople(me, ""), []);
  });

  await test("a wildcard is searched for literally, not as a wildcard", async () => {
    const me = await makeUser("רות");
    await makeUser("שמעון");
    // "%%" would match every name on the site if the pattern were passed through raw
    assert.deepEqual(await searchPeople(me, "%%"), []);
    assert.deepEqual(await searchPeople(me, "__"), []);
  });

  await test("a search result carries a name and a picture — never a score", async () => {
    const me = await makeUser("נועה");
    await makeUser("נועם");
    const [person] = await searchPeople(me, "נוע");
    assert.ok(person, "expected a result");
    assert.deepEqual(Object.keys(person).sort(), ["id", "image", "name", "relation"]);
  });

  /* ---------- asking and answering ---------- */

  await test("a request is pending for the asker and incoming for the other side", async () => {
    const a = await makeUser("איתי");
    const b = await makeUser("איילת");
    const res = await sendFriendRequest(a, b);
    assert.equal(res.ok && res.relation, "requested");

    const [asSeenByA] = await searchPeople(a, "איילת");
    assert.equal(asSeenByA.relation, "requested");
    const [asSeenByB] = await searchPeople(b, "איתי");
    assert.equal(asSeenByB.relation, "incoming");

    assert.equal(await countIncomingRequests(b), 1);
    assert.equal(await countIncomingRequests(a), 0);
    assert.equal((await listIncomingRequests(b))[0].id, a);
    assert.equal((await listOutgoingRequests(a))[0].id, b);
  });

  await test("accepting makes both sides friends, from either end", async () => {
    const [a, b] = await makeFriends();
    assert.deepEqual(await getFriendIds(a), [b]);
    assert.deepEqual(await getFriendIds(b), [a]);
    assert.equal(await countIncomingRequests(b), 0);
    assert.equal((await listFriends(a))[0].id, b);
    assert.equal((await listFriends(b))[0].id, a);
  });

  await test("only the person who was asked can accept", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await sendFriendRequest(a, b);
    const res = await acceptFriendRequest(a, b);
    assert.equal(res.ok, false, "the asker must not be able to accept their own request");
    assert.deepEqual(await getFriendIds(a), []);
  });

  await test("asking back someone who already asked you is a friendship, not a second request", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await sendFriendRequest(a, b);
    const res = await sendFriendRequest(b, a);
    assert.equal(res.ok && res.relation, "friends");
    assert.deepEqual(await getFriendIds(a), [b]);
    const rows = await db.select().from(friendships);
    assert.equal(rows.filter((r) => [a, b].includes(r.requesterId)).length, 1, "one row, not two");
  });

  await test("you cannot befriend yourself, or an account that does not exist", async () => {
    const a = await makeUser();
    assert.equal((await sendFriendRequest(a, a)).ok, false);
    assert.equal((await sendFriendRequest(a, "nobody")).ok, false);
  });

  await test("a repeated request is a no-op, not a second row", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await sendFriendRequest(a, b);
    await sendFriendRequest(a, b);
    await sendFriendRequest(a, b);
    const rows = await db.select().from(friendships).where(eq(friendships.requesterId, a));
    assert.equal(rows.length, 1);
  });

  /* ---------- saying no ---------- */

  await test("a declined request stays declined, and is not announced to the asker", async () => {
    const a = await makeUser("גל");
    const b = await makeUser("טל");
    await sendFriendRequest(a, b);
    assert.equal((await declineFriendRequest(b, a)).ok, true);

    // the asker is told what they were told before: the request is out. Not that it failed.
    const [seenByA] = await searchPeople(a, "טל");
    assert.equal(seenByA.relation, "requested");
    // and asking again changes nothing
    await sendFriendRequest(a, b);
    assert.deepEqual(await getFriendIds(b), []);
    assert.equal(await countIncomingRequests(b), 0);
  });

  await test("the person who declined can still ask themselves later", async () => {
    const a = await makeUser("עומר");
    const b = await makeUser("שירה");
    await sendFriendRequest(a, b);
    await declineFriendRequest(b, a);

    assert.equal((await sendFriendRequest(b, a)).ok, true);
    assert.equal(await countIncomingRequests(a), 1);
    await acceptFriendRequest(a, b);
    assert.deepEqual(await getFriendIds(a), [b]);
  });

  await test("a request can be taken back before it is answered", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await sendFriendRequest(a, b);
    assert.equal((await cancelFriendRequest(a, b)).ok, true);
    assert.equal(await countIncomingRequests(b), 0);
    // and the door is open again for either of them
    assert.equal((await sendFriendRequest(b, a)).ok, true);
  });

  await test("unfriending clears the row, so either of them may ask again", async () => {
    const [a, b] = await makeFriends();
    assert.equal((await removeFriend(a, b)).ok, true);
    assert.deepEqual(await getFriendIds(a), []);
    assert.deepEqual(await getFriendIds(b), []);
    assert.equal((await removeFriend(a, b)).ok, false, "there is nothing left to remove");
    assert.equal((await sendFriendRequest(b, a)).ok, true);
  });

  await test("outstanding requests are capped", async () => {
    const spammer = await makeUser();
    for (let i = 0; i < MAX_PENDING_REQUESTS; i++) {
      const target = await makeUser();
      assert.equal((await sendFriendRequest(spammer, target)).ok, true);
    }
    const oneMore = await makeUser();
    const res = await sendFriendRequest(spammer, oneMore);
    assert.equal(res.ok, false, "the cap must stop the next request");
    assert.equal(await countIncomingRequests(oneMore), 0);
  });

  /* ---------- what a friend sees ---------- */

  await test("a friend's numbers are points, answers and counts — and nothing else", async () => {
    const [a, b] = await makeFriends();
    const marketId = await makeMarket();
    await executeTrade({ userId: b, marketId, side: "YES", action: "BUY", quantity: 50 });

    const stats = (await friendStats([b])).get(b);
    assert.ok(stats, "expected stats for a friend");
    assert.deepEqual(Object.keys(stats).sort(), [...FRIEND_STAT_FIELDS].sort());
    // the closed list is the point: no marketId, no side, no price, no answer
    for (const key of Object.keys(stats)) {
      assert.ok(!/market|side|position(?!s)|price|trade(?!Count)/i.test(key), `${key} looks like a leak`);
    }

    const [friend] = await listFriends(a);
    assert.equal(friend.id, b);
    assert.equal(friend.openPositions, 1, "one open answer");
    assert.equal(friend.tradeCount, 1);
    assert.ok(friend.netWorth > 0);
    assert.deepEqual(
      Object.keys(friend).sort(),
      ["id", "image", "name", "netWorth", "openPositions", "pnl", "since", "tradeCount"],
    );
  });

  await test("a friend who has not played reads as a full starting balance and no positions", async () => {
    const [a, b] = await makeFriends();
    const [friend] = await listFriends(a);
    assert.equal(friend.id, b);
    assert.equal(friend.netWorth, STARTING_BALANCE);
    assert.equal(friend.pnl, 0);
    assert.equal(friend.openPositions, 0);
    assert.equal(friend.tradeCount, 0);
  });

  await test("an answer that was given back stops counting as an open position", async () => {
    const [a, b] = await makeFriends();
    const marketId = await makeMarket();
    const { position } = await executeTrade({ userId: b, marketId, side: "YES", action: "BUY", quantity: 20 });
    assert.equal((await listFriends(a))[0].openPositions, 1);

    await executeTrade({ userId: b, marketId, side: "YES", action: "SELL", quantity: position.shares });
    const [friend] = await listFriends(a);
    assert.equal(friend.openPositions, 0, "nothing is held any more");
    assert.equal(friend.tradeCount, 2, "…but both answers still happened");
  });

  await test("the friends list is ranked by score, best first", async () => {
    const me = await makeUser();
    const rich = await makeUser();
    const poor = await makeUser();
    for (const other of [rich, poor]) {
      await sendFriendRequest(me, other);
      await acceptFriendRequest(other, me);
    }
    await db.update(users).set({ balance: STARTING_BALANCE + 5000 }).where(eq(users.id, rich));
    await db.update(users).set({ balance: STARTING_BALANCE - 500 }).where(eq(users.id, poor));

    const list = await listFriends(me);
    assert.deepEqual(
      list.map((f) => f.id),
      [rich, poor],
    );
  });

  await test("only friends can be offered a league invitation, and only the ones not in it", async () => {
    const [a, b] = await makeFriends();
    const stranger = await makeUser();
    const offered = await friendsNotIn(a, []);
    assert.deepEqual(offered.map((p) => p.id), [b]);
    assert.ok(!offered.some((p) => p.id === stranger));
    assert.deepEqual(await friendsNotIn(a, [b]), [], "someone already inside is not offered again");
  });

  console.log(`friends: ${passed} tests passed${failures.length ? `, ${failures.length} FAILED` : ""}`);
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
