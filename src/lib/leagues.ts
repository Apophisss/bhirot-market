/**
 * The database side of leagues: opening one, filling it (by invite or by link),
 * leaving it, and ranking the people in it.
 *
 * The limits, the codes and the link live in `social.ts`. Two rules are kept here:
 *
 * 1. A league board is **the same arithmetic as the public leaderboard** — it calls
 *    `getStandings()` like everything else, so nobody ever sees two different totals
 *    for the same player.
 * 2. A league shows names and scores, never books. `LeagueStanding` carries points,
 *    a place and a count of open answers; which questions someone answered is not
 *    fetched here, in any query.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getStandings } from "./portfolio";
import { getFriendIds } from "./friends";
import {
  MAX_LEAGUES_OWNED,
  MAX_LEAGUES_PER_USER,
  MAX_LEAGUE_MEMBERS,
  generateLeagueCode,
  normalizeLeagueCode,
  normalizeLeagueName,
} from "./social";

const { users, leagues, leagueMembers } = schema;

export type LeagueRow = typeof leagues.$inferSelect;

/** One row of a league table: a person, their score, and where that puts them. */
export interface LeagueStanding {
  userId: string;
  name: string | null;
  image: string | null;
  rank: number;
  netWorth: number;
  pnl: number;
  /** how many open questions they hold an answer on — a count, never the questions */
  openPositions: number;
  tradeCount: number;
  isMe: boolean;
  isOwner: boolean;
  joinedAt: Date;
}

/** A league as it appears in the "my leagues" list. */
export interface LeagueSummary {
  id: number;
  code: string;
  name: string;
  members: number;
  isOwner: boolean;
  /** the viewer's place in this league, 1-based */
  myRank: number | null;
  createdAt: Date;
}

/** An invitation waiting for an answer. */
export interface LeagueInviteView {
  leagueId: number;
  name: string;
  code: string;
  members: number;
  invitedBy: string | null;
  invitedAt: Date;
}

export type LeagueResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: string };

/* ---------- reading ---------- */

export async function getLeagueById(id: number): Promise<LeagueRow | null> {
  const db = await getDb();
  const row = await db.query.leagues.findFirst({ where: eq(leagues.id, id) });
  return row ?? null;
}

export async function getLeagueByCode(rawCode: string | null | undefined): Promise<LeagueRow | null> {
  const code = normalizeLeagueCode(rawCode);
  if (!code) return null;
  const db = await getDb();
  const row = await db.query.leagues.findFirst({ where: eq(leagues.code, code) });
  return row ?? null;
}

/** The membership row for one person, whatever its status (`invited` counts as a row, not a member). */
export async function getMembership(leagueId: number, userId: string) {
  const db = await getDb();
  const row = await db.query.leagueMembers.findFirst({
    where: and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)),
  });
  return row ?? null;
}

export async function countMembers(leagueId: number): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.status, "member")));
  return Number(row?.n ?? 0);
}

/**
 * The league table, best score first.
 *
 * `viewerId` only decides which row is marked "you" — the numbers are the same for
 * everyone reading the board, because a private ranking that shows different figures
 * to different members is not a ranking.
 */
export async function getLeagueBoard(leagueId: number, viewerId?: string | null): Promise<LeagueStanding[]> {
  const db = await getDb();
  const rows = await db
    .select({
      userId: leagueMembers.userId,
      role: leagueMembers.role,
      joinedAt: sql<number>`coalesce(${leagueMembers.joinedAt}, ${leagueMembers.createdAt})`,
      name: users.name,
      image: users.image,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.status, "member")))
    .orderBy(asc(leagueMembers.createdAt))
    .limit(MAX_LEAGUE_MEMBERS);
  if (rows.length === 0) return [];

  const standings = await getStandings(rows.map((r) => r.userId));
  const byId = new Map(standings.map((s) => [s.userId, s]));
  return rows
    .map((r) => {
      const s = byId.get(r.userId);
      return {
        userId: r.userId,
        name: r.name,
        image: r.image,
        rank: 0,
        netWorth: s?.netWorth ?? 0,
        pnl: s?.pnl ?? 0,
        openPositions: s?.openPositions ?? 0,
        tradeCount: s?.tradeCount ?? 0,
        isMe: r.userId === viewerId,
        isOwner: r.role === "owner",
        joinedAt: new Date(Number(r.joinedAt)),
      };
    })
    .sort((a, b) => b.netWorth - a.netWorth || (a.name ?? "").localeCompare(b.name ?? ""))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

/**
 * Every league the user is actually in, with their place in each.
 *
 * One pass over the memberships and one valuation for everybody in them, rather than
 * a board per league: twenty leagues on one page must not be twenty round trips. The
 * ordering — score first, name as the tie-break — is copied from `getLeagueBoard`
 * exactly, so the place shown in the list is the place shown on the board.
 */
export async function listMyLeagues(userId: string): Promise<LeagueSummary[]> {
  const db = await getDb();
  const mine = await db
    .select({ league: leagues, role: leagueMembers.role })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.status, "member")))
    .orderBy(desc(leagues.createdAt))
    .limit(MAX_LEAGUES_PER_USER);
  if (mine.length === 0) return [];

  const leagueIds = mine.map((m) => m.league.id);
  const members = await db
    .select({ leagueId: leagueMembers.leagueId, userId: leagueMembers.userId, name: users.name })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(and(inArray(leagueMembers.leagueId, leagueIds), eq(leagueMembers.status, "member")));
  const standings = await getStandings(members.map((m) => m.userId));
  const worth = new Map(standings.map((s) => [s.userId, s.netWorth]));

  const byLeague = new Map<number, { userId: string; name: string | null }[]>();
  for (const m of members) {
    const list = byLeague.get(m.leagueId) ?? [];
    list.push({ userId: m.userId, name: m.name });
    byLeague.set(m.leagueId, list);
  }

  return mine.map(({ league, role }) => {
    const ranked = (byLeague.get(league.id) ?? []).sort(
      (a, b) =>
        (worth.get(b.userId) ?? 0) - (worth.get(a.userId) ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""),
    );
    const index = ranked.findIndex((r) => r.userId === userId);
    return {
      id: league.id,
      code: league.code,
      name: league.name,
      members: ranked.length,
      isOwner: role === "owner",
      myRank: index >= 0 ? index + 1 : null,
      createdAt: league.createdAt,
    };
  });
}

/** Invitations waiting for this user's answer. */
export async function listLeagueInvites(userId: string): Promise<LeagueInviteView[]> {
  const db = await getDb();
  const rows = await db
    .select({
      leagueId: leagues.id,
      name: leagues.name,
      code: leagues.code,
      invitedBy: leagueMembers.invitedBy,
      invitedAt: leagueMembers.createdAt,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.status, "invited")))
    .orderBy(desc(leagueMembers.createdAt))
    .limit(MAX_LEAGUES_PER_USER);
  if (rows.length === 0) return [];

  const inviterIds = rows.map((r) => r.invitedBy).filter((id): id is string => Boolean(id));
  const inviters = inviterIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, inviterIds))
    : [];
  const nameById = new Map(inviters.map((u) => [u.id, u.name]));
  const counts = await Promise.all(rows.map((r) => countMembers(r.leagueId)));

  return rows.map((r, i) => ({
    leagueId: r.leagueId,
    name: r.name,
    code: r.code,
    members: counts[i],
    invitedBy: r.invitedBy ? (nameById.get(r.invitedBy) ?? null) : null,
    invitedAt: r.invitedAt,
  }));
}

/** How many invitations are waiting — the badge in the header. */
export async function countLeagueInvites(userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.status, "invited")));
  return Number(row?.n ?? 0);
}

/* ---------- writing ---------- */

async function countLeaguesFor(userId: string, status: "member" | "invited" = "member"): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.status, status)));
  return Number(row?.n ?? 0);
}

/**
 * Open a league. The creator is its owner and its first member — a league of nobody
 * would be an empty page with a link on it.
 */
export async function createLeague(ownerId: string, rawName: string): Promise<LeagueResult<LeagueRow>> {
  const name = normalizeLeagueName(rawName);
  if (!name) return { ok: false, error: "שם הליגה קצר מדי" };
  const db = await getDb();

  const [owned] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leagues)
    .where(eq(leagues.ownerId, ownerId));
  if (Number(owned?.n ?? 0) >= MAX_LEAGUES_OWNED) {
    return { ok: false, error: `אפשר לפתוח עד ${MAX_LEAGUES_OWNED} ליגות` };
  }
  if ((await countLeaguesFor(ownerId)) >= MAX_LEAGUES_PER_USER) {
    return { ok: false, error: `אפשר להשתתף בעד ${MAX_LEAGUES_PER_USER} ליגות` };
  }

  // the code column is unique, so a collision (or two tabs racing) fails the insert
  // rather than handing two leagues the same link — draw again and try once more
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLeagueCode();
    try {
      const [league] = await db.insert(leagues).values({ code, name, ownerId }).returning();
      await db.insert(leagueMembers).values({
        leagueId: league.id,
        userId: ownerId,
        role: "owner",
        status: "member",
        joinedAt: new Date(),
      });
      return { ok: true, message: "הליגה נפתחה", data: league };
    } catch {
      // unique-constraint collision: fall through and draw another code
    }
  }
  return { ok: false, error: "לא הצלחנו לפתוח ליגה כרגע" };
}

/** Invite a friend into a league you are in. Only friends: a league is not a mailing list. */
export async function inviteToLeague(inviterId: string, leagueId: number, inviteeId: string): Promise<LeagueResult> {
  if (inviterId === inviteeId) return { ok: false, error: "אתם כבר בליגה" };
  const db = await getDb();
  const league = await getLeagueById(leagueId);
  if (!league) return { ok: false, error: "הליגה לא נמצאה" };
  const mine = await getMembership(leagueId, inviterId);
  if (!mine || mine.status !== "member") return { ok: false, error: "רק חברי הליגה יכולים להזמין" };

  const friends = await getFriendIds(inviterId);
  if (!friends.includes(inviteeId)) return { ok: false, error: "אפשר להזמין רק חברים" };

  const existing = await getMembership(leagueId, inviteeId);
  if (existing) {
    return existing.status === "member"
      ? { ok: true, message: "כבר בליגה" }
      : { ok: true, message: "ההזמנה כבר נשלחה" };
  }
  if ((await countMembers(leagueId)) >= MAX_LEAGUE_MEMBERS) {
    return { ok: false, error: `הליגה מלאה (${MAX_LEAGUE_MEMBERS} משתתפים)` };
  }
  try {
    await db.insert(leagueMembers).values({
      leagueId,
      userId: inviteeId,
      role: "member",
      status: "invited",
      invitedBy: inviterId,
    });
  } catch {
    // the unique index caught a double tap; the invitation is out either way
    return { ok: true, message: "ההזמנה נשלחה" };
  }
  return { ok: true, message: "ההזמנה נשלחה" };
}

/**
 * Walk in through the invite link.
 *
 * Anyone holding the link may join, which is the point of a link — the code is the
 * secret. A member who follows their own link just lands back on the board.
 */
export async function joinLeague(userId: string, rawCode: string): Promise<LeagueResult<LeagueRow>> {
  const league = await getLeagueByCode(rawCode);
  if (!league) return { ok: false, error: "הקישור לא מוביל לליגה קיימת" };
  const db = await getDb();

  const existing = await getMembership(league.id, userId);
  if (existing?.status === "member") return { ok: true, message: "כבר בליגה", data: league };
  if ((await countLeaguesFor(userId)) >= MAX_LEAGUES_PER_USER) {
    return { ok: false, error: `אפשר להשתתף בעד ${MAX_LEAGUES_PER_USER} ליגות` };
  }
  if ((await countMembers(league.id)) >= MAX_LEAGUE_MEMBERS) {
    return { ok: false, error: `הליגה מלאה (${MAX_LEAGUE_MEMBERS} משתתפים)` };
  }

  if (existing) {
    // an open invitation, answered by using the link instead of the button
    await db
      .update(leagueMembers)
      .set({ status: "member", joinedAt: new Date() })
      .where(eq(leagueMembers.id, existing.id));
    return { ok: true, message: "הצטרפתם לליגה", data: league };
  }
  try {
    await db
      .insert(leagueMembers)
      .values({ leagueId: league.id, userId, role: "member", status: "member", joinedAt: new Date() });
  } catch {
    return { ok: true, message: "כבר בליגה", data: league };
  }
  return { ok: true, message: "הצטרפתם לליגה", data: league };
}

/** Accept an invitation that is waiting on `/leagues`. */
export async function acceptLeagueInvite(userId: string, leagueId: number): Promise<LeagueResult<LeagueRow>> {
  const league = await getLeagueById(leagueId);
  if (!league) return { ok: false, error: "הליגה לא נמצאה" };
  const membership = await getMembership(leagueId, userId);
  if (!membership) return { ok: false, error: "אין הזמנה כזו" };
  if (membership.status === "member") return { ok: true, message: "כבר בליגה", data: league };
  return joinLeague(userId, league.code);
}

/** Turn an invitation down. The row goes, so the same friend may ask again another time. */
export async function declineLeagueInvite(userId: string, leagueId: number): Promise<LeagueResult> {
  const db = await getDb();
  const membership = await getMembership(leagueId, userId);
  if (!membership || membership.status !== "invited") return { ok: false, error: "אין הזמנה כזו" };
  await db.delete(leagueMembers).where(eq(leagueMembers.id, membership.id));
  return { ok: true, message: "ההזמנה נדחתה" };
}

/**
 * Leave a league.
 *
 * The owner cannot walk out on a league that still has people in it — the board would
 * be left with nobody who can close it. They hand it over by deleting it, or they stay.
 */
export async function leaveLeague(userId: string, leagueId: number): Promise<LeagueResult> {
  const db = await getDb();
  const membership = await getMembership(leagueId, userId);
  if (!membership) return { ok: false, error: "אתם לא בליגה הזו" };
  if (membership.role === "owner" && (await countMembers(leagueId)) > 1) {
    return { ok: false, error: "מי שפתח/ה את הליגה יכול/ה למחוק אותה, לא לעזוב אותה" };
  }
  await db.delete(leagueMembers).where(eq(leagueMembers.id, membership.id));
  // the last one out turns off the light
  if ((await countMembers(leagueId)) === 0) {
    await db.delete(leagues).where(eq(leagues.id, leagueId));
  }
  return { ok: true, message: "יצאתם מהליגה" };
}

/** Close a league. Only the owner, and it takes every membership row with it. */
export async function deleteLeague(userId: string, leagueId: number): Promise<LeagueResult> {
  const db = await getDb();
  const league = await getLeagueById(leagueId);
  if (!league) return { ok: false, error: "הליגה לא נמצאה" };
  if (league.ownerId !== userId) return { ok: false, error: "רק מי שפתח/ה את הליגה יכול/ה למחוק אותה" };
  // league_member.leagueId cascades, so the rows go with the league itself
  await db.delete(leagues).where(eq(leagues.id, leagueId));
  return { ok: true, message: "הליגה נמחקה" };
}

/** Remove someone else from a league you own. */
export async function removeMember(ownerId: string, leagueId: number, memberId: string): Promise<LeagueResult> {
  const db = await getDb();
  const league = await getLeagueById(leagueId);
  if (!league) return { ok: false, error: "הליגה לא נמצאה" };
  if (league.ownerId !== ownerId) return { ok: false, error: "רק מי שפתח/ה את הליגה יכול/ה להסיר משתתפים" };
  if (memberId === ownerId) return { ok: false, error: "אי אפשר להסיר את עצמך" };
  const membership = await getMembership(leagueId, memberId);
  if (!membership) return { ok: false, error: "המשתתף/ת לא בליגה" };
  await db.delete(leagueMembers).where(eq(leagueMembers.id, membership.id));
  return { ok: true, message: "המשתתף/ת הוסר/ה" };
}
