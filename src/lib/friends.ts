/**
 * The database side of the friends system: finding people, asking, answering, and
 * reporting what a friend is allowed to see.
 *
 * The rules and the numbers live in `social.ts`. The one rule worth repeating here,
 * because this file is where it is kept: a friend is shown **aggregates only** —
 * total points, how many open answers, how many answers in total. Which questions,
 * and on which side, never leaves the server. `friendStats()` is the only function
 * that reads another user's standing, and it returns numbers, not markets.
 */
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getStandings } from "./portfolio";
import {
  FRIEND_SEARCH_LIMIT,
  FRIEND_SEARCH_MAX,
  FRIEND_SEARCH_MIN,
  MAX_FRIENDS,
  MAX_PENDING_REQUESTS,
} from "./social";

const { users, friendships } = schema;

export type FriendshipRow = typeof friendships.$inferSelect;

/** How the viewer is related to another account, as the UI needs to label a button. */
export type Relation = "none" | "friends" | "requested" | "incoming" | "self";

export interface PersonView {
  id: string;
  name: string | null;
  image: string | null;
  relation: Relation;
}

/** The aggregate standing one friend is shown about another. No market ever appears here. */
export interface FriendStats {
  /** points: cash plus what the open answers would fetch if sold now */
  netWorth: number;
  /** profit or loss against the capital the house handed over (invite bonuses excluded) */
  pnl: number;
  /** how many open questions they are holding an answer on — a count, not a list */
  openPositions: number;
  /** how many answers they have given in total */
  tradeCount: number;
}

export interface FriendView extends FriendStats {
  id: string;
  name: string | null;
  image: string | null;
  /** when the friendship was accepted (or asked for, on a pending row) */
  since: Date;
}

export interface PendingRequestView {
  id: string;
  name: string | null;
  image: string | null;
  askedAt: Date;
}

export type FriendActionResult =
  | { ok: true; relation: Relation; message: string }
  | { ok: false; error: string };

/** The live row between two users, whichever of them asked. */
export async function getFriendship(a: string, b: string): Promise<FriendshipRow | null> {
  const db = await getDb();
  const row = await db.query.friendships.findFirst({
    where: or(
      and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
      and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
    ),
  });
  return row ?? null;
}

/**
 * How `viewer` is related to `other`.
 *
 * A declined request reads as `requested` to the person who sent it, deliberately:
 * the row is what stops them asking again, and telling them they were turned down
 * turns a quiet "no" into a notification. To the person who declined, it reads as
 * `none` — they can ask themselves later if it was a misfire.
 */
function relationFrom(row: FriendshipRow | null, viewerId: string): Relation {
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  if (row.status === "declined") return row.requesterId === viewerId ? "requested" : "none";
  return row.requesterId === viewerId ? "requested" : "incoming";
}

/** Every id `userId` is actually friends with. */
export async function getFriendIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    )
    .limit(MAX_FRIENDS);
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

/**
 * Find people by the name on their account.
 *
 * Name only — never email. Searching by address would turn the box into a way to ask
 * "is this person registered?" about anyone whose address you happen to know, and the
 * answer to that question is nobody's business. The result carries a name, a picture
 * and the relation; not one number about how they are doing.
 */
export async function searchPeople(viewerId: string, rawQuery: string): Promise<PersonView[]> {
  const q = rawQuery.trim().slice(0, FRIEND_SEARCH_MAX);
  if (q.length < FRIEND_SEARCH_MIN) return [];
  const db = await getDb();
  // the wildcards are escaped (and the escape character declared, which SQLite's LIKE
  // does not assume) so a query of "%" matches a literal per cent sign, not everyone
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(users)
    .where(
      and(
        ne(users.id, viewerId),
        sql`${users.name} is not null`,
        sql`lower(${users.name}) like lower(${pattern}) escape '\\'`,
      ),
    )
    .orderBy(users.name)
    .limit(FRIEND_SEARCH_LIMIT);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const links = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, viewerId), inArray(friendships.addresseeId, ids)),
        and(eq(friendships.addresseeId, viewerId), inArray(friendships.requesterId, ids)),
      ),
    );
  const byOther = new Map(
    links.map((l) => [l.requesterId === viewerId ? l.addresseeId : l.requesterId, l]),
  );
  return rows.map((r) => ({ ...r, relation: relationFrom(byOther.get(r.id) ?? null, viewerId) }));
}

/** Ask someone to be friends. Safe to call twice: the second call reports the existing state. */
export async function sendFriendRequest(requesterId: string, addresseeId: string): Promise<FriendActionResult> {
  if (requesterId === addresseeId) return { ok: false, error: "אי אפשר להוסיף את עצמך" };
  const db = await getDb();
  const target = await db.query.users.findFirst({ where: eq(users.id, addresseeId) });
  if (!target) return { ok: false, error: "המשתמש לא נמצא" };

  const existing = await getFriendship(requesterId, addresseeId);
  if (existing) {
    if (existing.status === "accepted") return { ok: true, relation: "friends", message: "כבר חברים" };
    if (existing.requesterId === requesterId) {
      // includes a declined row: the "no" stands, and it is not announced
      return { ok: true, relation: "requested", message: "הבקשה נשלחה" };
    }
    if (existing.status === "pending") {
      // they asked first and now we are asking back — that is two yeses, so it is a friendship
      return acceptFriendRequest(requesterId, addresseeId);
    }
    // they asked once and we said no — and now we are the ones asking. Replace the dead
    // row with ours, so a "no" we gave in haste is not a door we locked on ourselves.
    await db.delete(friendships).where(eq(friendships.id, existing.id));
  }

  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)` })
    .from(friendships)
    .where(and(eq(friendships.requesterId, requesterId), eq(friendships.status, "pending")));
  if (Number(pending) >= MAX_PENDING_REQUESTS) {
    return { ok: false, error: `יש כבר ${MAX_PENDING_REQUESTS} בקשות שממתינות לתשובה` };
  }
  const friends = await getFriendIds(requesterId);
  if (friends.length >= MAX_FRIENDS) return { ok: false, error: "רשימת החברים מלאה" };

  try {
    await db.insert(friendships).values({ requesterId, addresseeId, status: "pending" });
  } catch {
    // the unique index caught a double tap; the request is in either way
    return { ok: true, relation: "requested", message: "הבקשה נשלחה" };
  }
  return { ok: true, relation: "requested", message: "הבקשה נשלחה" };
}

/** Accept a request `requesterId` sent to `userId`. */
export async function acceptFriendRequest(userId: string, requesterId: string): Promise<FriendActionResult> {
  const db = await getDb();
  const row = await getFriendship(userId, requesterId);
  if (!row) return { ok: false, error: "אין בקשה כזו" };
  if (row.status === "accepted") return { ok: true, relation: "friends", message: "כבר חברים" };
  if (row.addresseeId !== userId) return { ok: false, error: "רק מי שקיבל/ה את הבקשה יכול/ה לאשר אותה" };
  const friends = await getFriendIds(userId);
  if (friends.length >= MAX_FRIENDS) return { ok: false, error: "רשימת החברים מלאה" };

  await db
    .update(friendships)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(friendships.id, row.id));
  return { ok: true, relation: "friends", message: "נוספתם כחברים" };
}

/**
 * Turn a request down. The row stays as `declined` — it is what stops the same person
 * asking every morning — and nothing is sent back to them.
 */
export async function declineFriendRequest(userId: string, requesterId: string): Promise<FriendActionResult> {
  const db = await getDb();
  const row = await getFriendship(userId, requesterId);
  if (!row || row.addresseeId !== userId || row.status !== "pending") {
    return { ok: false, error: "אין בקשה כזו" };
  }
  await db
    .update(friendships)
    .set({ status: "declined", respondedAt: new Date() })
    .where(eq(friendships.id, row.id));
  return { ok: true, relation: "none", message: "הבקשה נדחתה" };
}

/** Take back a request you sent, before it was answered. */
export async function cancelFriendRequest(requesterId: string, addresseeId: string): Promise<FriendActionResult> {
  const db = await getDb();
  const row = await getFriendship(requesterId, addresseeId);
  if (!row || row.requesterId !== requesterId || row.status !== "pending") {
    return { ok: false, error: "אין בקשה לביטול" };
  }
  await db.delete(friendships).where(eq(friendships.id, row.id));
  return { ok: true, relation: "none", message: "הבקשה בוטלה" };
}

/**
 * Unfriend. The row is deleted rather than marked, so either side may ask again —
 * an ex-friend is a stranger, not a person under a ban.
 */
export async function removeFriend(userId: string, otherId: string): Promise<FriendActionResult> {
  const db = await getDb();
  const row = await getFriendship(userId, otherId);
  if (!row || row.status !== "accepted") return { ok: false, error: "אתם לא חברים" };
  await db.delete(friendships).where(eq(friendships.id, row.id));
  return { ok: true, relation: "none", message: "החברות הוסרה" };
}

/**
 * The aggregate standing of a set of accounts, by id.
 *
 * Everything a friend sees about a friend comes through here, and it is deliberately
 * the same arithmetic as the public leaderboard (`getStandings`) so the two can never
 * disagree about the same person.
 */
export async function friendStats(userIds: string[]): Promise<Map<string, FriendStats>> {
  const rows = await getStandings(userIds);
  return new Map(
    rows.map((r) => [
      r.userId,
      { netWorth: r.netWorth, pnl: r.pnl, openPositions: r.openPositions, tradeCount: r.tradeCount },
    ]),
  );
}

/** The friends list, best score first — the small ranking a player actually cares about. */
export async function listFriends(userId: string): Promise<FriendView[]> {
  const db = await getDb();
  const rows = await db
    .select({
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      since: sql<number>`coalesce(${friendships.respondedAt}, ${friendships.createdAt})`,
      name: users.name,
      image: users.image,
      otherId: users.id,
    })
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(eq(friendships.requesterId, userId), eq(users.id, friendships.addresseeId)),
        and(eq(friendships.addresseeId, userId), eq(users.id, friendships.requesterId)),
      ),
    )
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    )
    .limit(MAX_FRIENDS);

  const stats = await friendStats(rows.map((r) => r.otherId));
  return rows
    .map((r) => ({
      id: r.otherId,
      name: r.name,
      image: r.image,
      since: new Date(Number(r.since)),
      ...(stats.get(r.otherId) ?? { netWorth: 0, pnl: 0, openPositions: 0, tradeCount: 0 }),
    }))
    .sort((a, b) => b.netWorth - a.netWorth);
}

/** Requests waiting for this user's answer, newest first. */
export async function listIncomingRequests(userId: string): Promise<PendingRequestView[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, image: users.image, askedAt: friendships.createdAt })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")))
    .orderBy(desc(friendships.createdAt))
    .limit(MAX_PENDING_REQUESTS);
  return rows;
}

/** Requests this user sent and nobody has answered yet. */
export async function listOutgoingRequests(userId: string): Promise<PendingRequestView[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, image: users.image, askedAt: friendships.createdAt })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.addresseeId))
    .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "pending")))
    .orderBy(desc(friendships.createdAt))
    .limit(MAX_PENDING_REQUESTS);
  return rows;
}

/** How many requests are waiting — the badge in the header. Cheap enough to run on every page. */
export async function countIncomingRequests(userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(friendships)
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")));
  return Number(row?.n ?? 0);
}

/** People the viewer may still invite to a league: friends who are not in it yet. */
export async function friendsNotIn(userId: string, excludeIds: string[]): Promise<PersonView[]> {
  const ids = await getFriendIds(userId);
  const remaining = ids.filter((id) => !excludeIds.includes(id));
  if (remaining.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(users)
    .where(inArray(users.id, remaining))
    .orderBy(users.name);
  return rows.map((r) => ({ ...r, relation: "friends" as const }));
}
