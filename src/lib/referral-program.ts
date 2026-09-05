/**
 * The database side of the invite programme: minting a personal code, paying the
 * bonus when an invited friend signs up, and reporting what a user has earned.
 *
 * The offer itself (how much, how many, how the link looks) lives in `referral.ts`.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import {
  MAX_REFERRALS,
  REFERRAL_BONUS,
  generateReferralCode,
  normalizeReferralCode,
} from "./referral";

const { users, referrals } = schema;

/**
 * The user's invite code, minting one on first use. Existing accounts predate the
 * programme and every new account is created by the Auth.js adapter, so the code has
 * to be lazy — there is no single moment to hand it out at.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error(`no such user: ${userId}`);
  if (user.referralCode) return user.referralCode;

  // the column is unique, so a collision (or two tabs racing) surfaces as a failed
  // insert rather than two users sharing a code — try again, then read back the winner
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const [row] = await db
        .update(users)
        .set({ referralCode: code })
        .where(sql`${users.id} = ${userId} and ${users.referralCode} is null`)
        .returning({ referralCode: users.referralCode });
      if (row?.referralCode) return row.referralCode;
      const current = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (current?.referralCode) return current.referralCode;
    } catch {
      // unique-constraint collision: fall through and draw another code
    }
  }
  throw new Error("could not mint a referral code");
}

export async function findUserByReferralCode(rawCode: string | null | undefined) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const db = await getDb();
  const row = await db.query.users.findFirst({ where: eq(users.referralCode, code) });
  return row ?? null;
}

export type ClaimResult = "credited" | "recorded" | "none";

/**
 * Attribute a brand-new account to the invite code it arrived with and pay the inviter.
 *
 * Returns `"credited"` when the bonus was paid, `"recorded"` when the invite counted but
 * the inviter is past their cap, and `"none"` when nothing applied — an unknown code, a
 * self-invite, or an account that already has an inviter. Safe to call more than once:
 * the write only lands while `referredBy` is still null, so a retry pays nothing twice.
 */
export async function claimReferral(invitedUserId: string, rawCode: string | null | undefined): Promise<ClaimResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return "none";
  const db = await getDb();

  return db.transaction(async (tx) => {
    const invited = await tx.query.users.findFirst({ where: eq(users.id, invitedUserId) });
    if (!invited || invited.referredBy) return "none";

    const referrer = await tx.query.users.findFirst({ where: eq(users.referralCode, code) });
    if (!referrer || referrer.id === invited.id) return "none";

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(referrals)
      .where(eq(referrals.referrerId, referrer.id));
    const bonus = count < MAX_REFERRALS ? REFERRAL_BONUS : 0;

    // guarded on referredBy so two sign-in requests for the same new account can't both pay
    const [claimed] = await tx
      .update(users)
      .set({ referredBy: referrer.id })
      .where(sql`${users.id} = ${invited.id} and ${users.referredBy} is null`)
      .returning({ id: users.id });
    if (!claimed) return "none";

    await tx.insert(referrals).values({ referrerId: referrer.id, invitedId: invited.id, bonus });
    if (bonus > 0) {
      await tx
        .update(users)
        .set({ balance: sql`${users.balance} + ${bonus}` })
        .where(eq(users.id, referrer.id));
    }
    return bonus > 0 ? "credited" : "recorded";
  });
}

export interface InvitedFriend {
  name: string | null;
  image: string | null;
  bonus: number;
  joinedAt: Date;
}

export interface ReferralSummary {
  code: string;
  /** how many friends signed up through the link */
  invited: number;
  /** ₪ actually paid out for them */
  earned: number;
  /** paid invites still available before the cap */
  remaining: number;
  friends: InvitedFriend[];
}

export async function getReferralSummary(userId: string, friendLimit = 12): Promise<ReferralSummary> {
  const db = await getDb();
  const [code, rows] = await Promise.all([
    getOrCreateReferralCode(userId),
    db
      .select({ name: users.name, image: users.image, bonus: referrals.bonus, joinedAt: referrals.createdAt })
      .from(referrals)
      .innerJoin(users, eq(referrals.invitedId, users.id))
      .where(eq(referrals.referrerId, userId))
      .orderBy(desc(referrals.createdAt)),
  ]);
  const earned = rows.reduce((sum, r) => sum + r.bonus, 0);
  return {
    code,
    invited: rows.length,
    earned,
    remaining: Math.max(0, MAX_REFERRALS - rows.length),
    friends: rows.slice(0, friendLimit),
  };
}

/**
 * Bonus money a user was handed rather than traded for. Every P&L on the site subtracts
 * it — an invite grows your balance, it must not grow your record as a forecaster.
 */
export async function getReferralEarnings(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${referrals.bonus}), 0)` })
    .from(referrals)
    .where(eq(referrals.referrerId, userId));
  return row?.total ?? 0;
}

/** Same figure for everyone at once, for the leaderboard. */
export async function getReferralEarningsByUser(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db
    .select({ userId: referrals.referrerId, total: sql<number>`coalesce(sum(${referrals.bonus}), 0)` })
    .from(referrals)
    .groupBy(referrals.referrerId);
  return new Map(rows.map((r) => [r.userId, r.total]));
}
