import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Attribution, Conversion } from "./analytics";

const { users, trades } = schema;

/**
 * Shekel value handed to Google for each conversion. These are not payments —
 * the site has none — they are the exchange rate between the two events, which
 * is what value-based bidding actually optimises against. A user who places a
 * trade is worth roughly five who only registered, so that is the ratio.
 */
export const CONVERSION_VALUE: Record<Conversion["name"], number> = { sign_up: 4, first_trade: 20 };

/**
 * Returns the conversions this user still owes Google, and marks them reported
 * in the same statement.
 *
 * Letting the browser decide would double-count on every refresh and back
 * button, and Google's bidding is only as good as its conversion count. Each
 * claim is an UPDATE guarded by `WHERE … IS NULL`, so a second call — or a
 * second tab — comes back empty rather than reporting twice.
 */
export async function claimConversions(userId: string, attr: Attribution | null = null): Promise<Conversion[]> {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return [];

  const events: Conversion[] = [];
  const now = new Date();

  if (!user.signupReportedAt) {
    const claimed = await db
      .update(users)
      .set({
        signupReportedAt: now,
        // stamp the click that paid for this signup, but never overwrite an earlier one
        ...(attr && !user.gclid
          ? { gclid: attr.gclid ?? null, utmSource: attr.utmSource ?? null, utmCampaign: attr.utmCampaign ?? null }
          : {}),
      })
      .where(and(eq(users.id, userId), isNull(users.signupReportedAt)))
      .returning({ id: users.id });
    if (claimed.length) events.push({ name: "sign_up", value: CONVERSION_VALUE.sign_up });
  }

  if (!user.firstTradeReportedAt) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(trades).where(eq(trades.userId, userId));
    if (n > 0) {
      const claimed = await db
        .update(users)
        .set({ firstTradeReportedAt: now })
        .where(and(eq(users.id, userId), isNull(users.firstTradeReportedAt)))
        .returning({ id: users.id });
      if (claimed.length) events.push({ name: "first_trade", value: CONVERSION_VALUE.first_trade });
    }
  }

  return events;
}
