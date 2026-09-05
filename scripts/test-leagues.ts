/**
 * Tests for leagues: opening one, filling it by invitation and by link, the board and
 * its places, leaving, closing, and the limits that keep a private table private.
 *
 * Runs the real code (`src/lib/leagues.ts`) against a throwaway SQLite file, so the
 * migration, the unique membership index and the cascade on delete are exercised for
 * real.
 *
 * Run: npx tsx scripts/test-leagues.ts   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

// the db module reads DATABASE_URL lazily, on the first getDb() — setting it
// here (before main runs) is enough to keep the tests off the real database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-leagues-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { getDb, schema } from "../src/lib/db";
import { STARTING_BALANCE } from "../src/lib/db/schema";
import {
  acceptLeagueInvite,
  countLeagueInvites,
  countMembers,
  createLeague,
  declineLeagueInvite,
  deleteLeague,
  getLeagueBoard,
  getLeagueByCode,
  getMembership,
  inviteToLeague,
  joinLeague,
  leaveLeague,
  listLeagueInvites,
  listMyLeagues,
  removeMember,
  type LeagueRow,
} from "../src/lib/leagues";
import { acceptFriendRequest, sendFriendRequest } from "../src/lib/friends";
import {
  LEAGUE_CODE_LENGTH,
  MAX_LEAGUES_OWNED,
  MAX_LEAGUE_MEMBERS,
  generateLeagueCode,
  leagueUrl,
  normalizeLeagueCode,
  normalizeLeagueName,
} from "../src/lib/social";
import { getLeaderboard } from "../src/lib/portfolio";
import { executeTrade } from "../src/lib/trade";
import { initialState } from "../src/lib/lmsr";

const { users, markets, leagues, leagueMembers } = schema;

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
async function makeUser(name?: string, balance = STARTING_BALANCE) {
  const id = `u${++seq}`;
  await db.insert(users).values({ id, name: name ?? `שחקן ${id}`, email: `${id}@test.local`, balance });
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

async function befriend(a: string, b: string) {
  await sendFriendRequest(a, b);
  await acceptFriendRequest(b, a);
}

/** A league with its owner, the starting point for most tests. */
async function makeLeague(name = "הליגה שלנו"): Promise<{ owner: string; league: LeagueRow }> {
  const owner = await makeUser();
  const res = await createLeague(owner, name);
  assert.ok(res.ok && res.data, "expected the league to open");
  return { owner, league: res.data };
}

async function main() {
  db = await getDb();

  /* ---------- codes and names ---------- */

  await test("a generated code is the advertised length, and drawn from the safe alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateLeagueCode();
      assert.equal(code.length, LEAGUE_CODE_LENGTH);
      assert.match(code, /^[23456789abcdefghjkmnpqrstuvwxyz]+$/, `${code} left the alphabet`);
    }
  });

  await test("codes do not repeat over a large draw", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateLeagueCode()));
    assert.ok(seen.size > 1990, `only ${seen.size}/2000 distinct codes`);
  });

  await test("a pasted invite link is accepted in every shape it arrives in", () => {
    assert.equal(normalizeLeagueCode("ab3d5fgh"), "ab3d5fgh");
    assert.equal(normalizeLeagueCode("AB3D5FGH"), "ab3d5fgh");
    assert.equal(normalizeLeagueCode(" /l/ab3d5fgh/ "), "ab3d5fgh");
    assert.equal(normalizeLeagueCode("https://bhirot-market.com/l/ab3d5fgh"), "ab3d5fgh");
    assert.equal(normalizeLeagueCode("https://bhirot-market.com/l/ab3d5fgh?utm_source=whatsapp"), "ab3d5fgh");
    assert.equal(normalizeLeagueCode(leagueUrl("ab3d5fgh")), "ab3d5fgh");
  });

  await test("anything that could never be a code is rejected", () => {
    for (const bad of [null, undefined, "", "ab", "a".repeat(17), "ab_3d5", "../../etc", "שלום"]) {
      assert.equal(normalizeLeagueCode(bad), null, `accepted ${JSON.stringify(bad)}`);
    }
  });

  await test("a league name is trimmed and collapsed, and an empty one is refused", () => {
    assert.equal(normalizeLeagueName("  החברים   מהעבודה  "), "החברים מהעבודה");
    assert.equal(normalizeLeagueName("א"), null);
    assert.equal(normalizeLeagueName("   "), null);
    assert.equal(normalizeLeagueName("x".repeat(80))?.length, 40);
  });

  /* ---------- opening ---------- */

  await test("opening a league makes the creator its owner and its first member", async () => {
    const { owner, league } = await makeLeague("משפחת כהן");
    assert.equal(league.name, "משפחת כהן");
    assert.equal(league.ownerId, owner);
    assert.equal(await countMembers(league.id), 1);

    const membership = await getMembership(league.id, owner);
    assert.equal(membership?.role, "owner");
    assert.equal(membership?.status, "member");

    const [summary] = await listMyLeagues(owner);
    assert.equal(summary.id, league.id);
    assert.equal(summary.isOwner, true);
    assert.equal(summary.members, 1);
    assert.equal(summary.myRank, 1);
  });

  await test("a league without a real name is not opened", async () => {
    const user = await makeUser();
    assert.equal((await createLeague(user, " ")).ok, false);
    assert.equal((await createLeague(user, "א")).ok, false);
    assert.deepEqual(await listMyLeagues(user), []);
  });

  await test("two leagues never share a code", async () => {
    const owner = await makeUser();
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await createLeague(owner, `ליגה ${i}`);
      assert.ok(res.ok && res.data);
      codes.add(res.data.code);
    }
    assert.equal(codes.size, 5);
  });

  await test("the number of leagues one account may open is capped", async () => {
    const owner = await makeUser();
    for (let i = 0; i < MAX_LEAGUES_OWNED; i++) {
      assert.equal((await createLeague(owner, `ליגה ${i}`)).ok, true);
    }
    assert.equal((await createLeague(owner, "אחת אחרונה")).ok, false, "the cap must stop the next one");
  });

  /* ---------- joining ---------- */

  await test("the invite link lets anyone holding it in", async () => {
    const { owner, league } = await makeLeague();
    const friend = await makeUser();
    const res = await joinLeague(friend, league.code);
    assert.equal(res.ok, true);
    assert.equal(await countMembers(league.id), 2);

    const board = await getLeagueBoard(league.id, friend);
    assert.deepEqual(board.map((r) => r.userId).sort(), [owner, friend].sort());
  });

  await test("a pasted full URL joins the same league as the bare code", async () => {
    const { league } = await makeLeague();
    const friend = await makeUser();
    assert.equal((await joinLeague(friend, leagueUrl(league.code))).ok, true);
    assert.equal(await countMembers(league.id), 2);
  });

  await test("following the link twice does not double the membership", async () => {
    const { league } = await makeLeague();
    const friend = await makeUser();
    await joinLeague(friend, league.code);
    await joinLeague(friend, league.code);
    assert.equal(await countMembers(league.id), 2);
    const rows = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, league.id));
    assert.equal(rows.length, 2);
  });

  await test("a link that leads nowhere is refused, not invented", async () => {
    const user = await makeUser();
    assert.equal((await joinLeague(user, "zzzzzzzz")).ok, false);
    assert.equal((await joinLeague(user, "not a code")).ok, false);
    assert.equal(await getLeagueByCode("zzzzzzzz"), null);
  });

  await test("only friends can be invited directly, and only by a member", async () => {
    const { owner, league } = await makeLeague();
    const stranger = await makeUser();
    const friend = await makeUser();
    await befriend(owner, friend);

    assert.equal((await inviteToLeague(owner, league.id, stranger)).ok, false, "a stranger is not invitable");
    assert.equal((await inviteToLeague(stranger, league.id, friend)).ok, false, "an outsider cannot invite");
    assert.equal((await inviteToLeague(owner, league.id, friend)).ok, true);

    // an invitation is not a membership until it is answered
    assert.equal(await countMembers(league.id), 1);
    assert.equal(await countLeagueInvites(friend), 1);
    const [invite] = await listLeagueInvites(friend);
    assert.equal(invite.leagueId, league.id);
    assert.equal(invite.members, 1);
  });

  await test("accepting an invitation joins; declining removes it without joining", async () => {
    const { owner, league } = await makeLeague();
    const yes = await makeUser();
    const no = await makeUser();
    await befriend(owner, yes);
    await befriend(owner, no);
    await inviteToLeague(owner, league.id, yes);
    await inviteToLeague(owner, league.id, no);

    assert.equal((await acceptLeagueInvite(yes, league.id)).ok, true);
    assert.equal((await declineLeagueInvite(no, league.id)).ok, true);

    assert.equal(await countMembers(league.id), 2);
    assert.equal(await countLeagueInvites(yes), 0);
    assert.equal(await countLeagueInvites(no), 0);
    assert.equal(await getMembership(league.id, no), null, "a declined invitation leaves no row");
    // …and the friend who said no can be asked again another time
    assert.equal((await inviteToLeague(owner, league.id, no)).ok, true);
  });

  await test("an invited friend who uses the link instead of the button still joins once", async () => {
    const { owner, league } = await makeLeague();
    const friend = await makeUser();
    await befriend(owner, friend);
    await inviteToLeague(owner, league.id, friend);

    assert.equal((await joinLeague(friend, league.code)).ok, true);
    assert.equal(await countMembers(league.id), 2);
    assert.equal(await countLeagueInvites(friend), 0);
  });

  await test("a league fills up and then stops accepting", async () => {
    const { league } = await makeLeague();
    for (let i = 1; i < MAX_LEAGUE_MEMBERS; i++) {
      assert.equal((await joinLeague(await makeUser(), league.code)).ok, true, `member ${i} should fit`);
    }
    assert.equal(await countMembers(league.id), MAX_LEAGUE_MEMBERS);
    const late = await makeUser();
    assert.equal((await joinLeague(late, league.code)).ok, false, "the cap must stop the next one");
    assert.equal(await getMembership(league.id, late), null);
  });

  /* ---------- the board ---------- */

  await test("the board ranks by points, marks the reader, and never carries a question", async () => {
    const { owner, league } = await makeLeague();
    const rich = await makeUser("עשירה");
    const poor = await makeUser("עני");
    await joinLeague(rich, league.code);
    await joinLeague(poor, league.code);
    await db.update(users).set({ balance: STARTING_BALANCE + 3000 }).where(eq(users.id, rich));
    await db.update(users).set({ balance: STARTING_BALANCE - 1000 }).where(eq(users.id, poor));

    const board = await getLeagueBoard(league.id, owner);
    assert.deepEqual(board.map((r) => r.userId), [rich, owner, poor]);
    assert.deepEqual(board.map((r) => r.rank), [1, 2, 3]);
    assert.equal(board.find((r) => r.isMe)?.userId, owner);
    assert.equal(board.filter((r) => r.isMe).length, 1);
    assert.equal(board.find((r) => r.userId === owner)?.isOwner, true);

    for (const row of board) {
      assert.deepEqual(
        Object.keys(row).sort(),
        [
          "image",
          "isMe",
          "isOwner",
          "joinedAt",
          "name",
          "netWorth",
          "openPositions",
          "pnl",
          "rank",
          "tradeCount",
          "userId",
        ],
        "a league row is a score, not a book",
      );
    }
  });

  await test("everyone in the league reads the same numbers", async () => {
    const { owner, league } = await makeLeague();
    const other = await makeUser();
    await joinLeague(other, league.code);
    // `isMe` is the one field that is allowed to differ — it says which row is yours
    const withoutMe = (rows: Awaited<ReturnType<typeof getLeagueBoard>>) => rows.map((r) => ({ ...r, isMe: false }));
    const asOwner = await getLeagueBoard(league.id, owner);
    const asOther = await getLeagueBoard(league.id, other);
    assert.deepEqual(withoutMe(asOwner), withoutMe(asOther));
  });

  await test("a league score is the same score the public leaderboard shows", async () => {
    const { owner, league } = await makeLeague();
    const marketId = await makeMarket();
    await executeTrade({ userId: owner, marketId, side: "YES", action: "BUY", quantity: 40 });

    const [mine] = (await getLeagueBoard(league.id, owner)).filter((r) => r.userId === owner);
    const public_ = (await getLeaderboard()).find((r) => r.userId === owner);
    assert.ok(public_, "the trader should be on the public board too");
    assert.equal(mine.netWorth, public_.netWorth);
    assert.equal(mine.pnl, public_.pnl);
    assert.equal(mine.openPositions, 1);
    assert.equal(mine.tradeCount, 1);
  });

  await test("the place shown in the leagues list is the place shown on the board", async () => {
    const { owner, league } = await makeLeague();
    const rival = await makeUser();
    await joinLeague(rival, league.code);
    await db.update(users).set({ balance: STARTING_BALANCE + 9000 }).where(eq(users.id, rival));

    const [summary] = (await listMyLeagues(owner)).filter((l) => l.id === league.id);
    const board = await getLeagueBoard(league.id, owner);
    assert.equal(summary.myRank, board.find((r) => r.isMe)?.rank);
    assert.equal(summary.myRank, 2);
    assert.equal(summary.members, board.length);
  });

  /* ---------- leaving and closing ---------- */

  await test("a member can leave, and stops seeing the league", async () => {
    const { league } = await makeLeague();
    const member = await makeUser();
    await joinLeague(member, league.code);
    assert.equal((await leaveLeague(member, league.id)).ok, true);
    assert.equal(await countMembers(league.id), 1);
    assert.deepEqual(await listMyLeagues(member), []);
  });

  await test("the owner cannot walk out on a league that still has people in it", async () => {
    const { owner, league } = await makeLeague();
    await joinLeague(await makeUser(), league.code);
    assert.equal((await leaveLeague(owner, league.id)).ok, false);
    assert.equal(await countMembers(league.id), 2);
  });

  await test("the last one out closes the league behind them", async () => {
    const { owner, league } = await makeLeague();
    assert.equal((await leaveLeague(owner, league.id)).ok, true);
    const row = await db.query.leagues.findFirst({ where: eq(leagues.id, league.id) });
    assert.equal(row, undefined, "an empty league is not left lying around");
  });

  await test("only the owner may close a league, and closing it takes the memberships with it", async () => {
    const { owner, league } = await makeLeague();
    const member = await makeUser();
    await joinLeague(member, league.code);

    assert.equal((await deleteLeague(member, league.id)).ok, false, "a member must not be able to close it");
    assert.equal((await deleteLeague(owner, league.id)).ok, true);
    assert.equal(await db.query.leagues.findFirst({ where: eq(leagues.id, league.id) }), undefined);
    const rows = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, league.id));
    assert.equal(rows.length, 0, "the membership rows should cascade");
    assert.deepEqual(await listMyLeagues(member), []);
  });

  await test("the owner can remove someone else, but not themselves", async () => {
    const { owner, league } = await makeLeague();
    const member = await makeUser();
    const other = await makeUser();
    await joinLeague(member, league.code);
    await joinLeague(other, league.code);

    assert.equal((await removeMember(member, league.id, other)).ok, false, "only the owner removes");
    assert.equal((await removeMember(owner, league.id, owner)).ok, false, "not themselves");
    assert.equal((await removeMember(owner, league.id, member)).ok, true);
    assert.equal(await countMembers(league.id), 2);
    assert.equal(await getMembership(league.id, member), null);
  });

  console.log(`leagues: ${passed} tests passed${failures.length ? `, ${failures.length} FAILED` : ""}`);
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
