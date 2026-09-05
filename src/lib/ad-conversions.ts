import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { parseAdAttribution, type AdAttribution } from "./ad-attribution";

const { users, trades } = schema;

/** The two moments worth reporting to Google Ads. */
export type AdConversionName = "sign_up" | "first_trade";

export interface AdConversion {
  name: AdConversionName;
  /** Modelled shekel worth — see below. */
  value: number;
}

/**
 * What each conversion is worth to the campaign.
 *
 * Not money: the site has none. These are the exchange rate between the two
 * events, which is the only thing value-based bidding can compare. A user who
 * places a trade is worth roughly five who only registered, so that is the
 * ratio. (GA4 events stay value-free on purpose — see `gtag.ts` — because
 * there they would land in revenue reports as if the play money were real.)
 */
export const AD_CONVERSION_VALUE: Record<AdConversionName, number> = { sign_up: 4, first_trade: 20 };

/**
 * Returns the conversions this user still owes Google, and marks them reported
 * in the same statement.
 *
 * Letting the browser decide would double-count on every refresh and back
 * button, and Google's bidding is only as good as its conversion count — an
 * inflated count quietly drags the bid up with it. Each claim is an UPDATE
 * guarded by `WHERE … IS NULL`, so a second call, or a second tab, comes back
 * empty rather than reporting twice.
 */
export async function claimAdConversions(userId: string): Promise<AdConversion[]> {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return [];

  const events: AdConversion[] = [];
  const now = new Date();

  if (!user.signupReportedAt) {
    const claimed = await db
      .update(users)
      .set({ signupReportedAt: now })
      .where(and(eq(users.id, userId), isNull(users.signupReportedAt)))
      .returning({ id: users.id });
    if (claimed.length) events.push({ name: "sign_up", value: AD_CONVERSION_VALUE.sign_up });
  }

  if (!user.firstTradeReportedAt) {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(trades).where(eq(trades.userId, userId));
    if ((row?.n ?? 0) > 0) {
      const claimed = await db
        .update(users)
        .set({ firstTradeReportedAt: now })
        .where(and(eq(users.id, userId), isNull(users.firstTradeReportedAt)))
        .returning({ id: users.id });
      if (claimed.length) events.push({ name: "first_trade", value: AD_CONVERSION_VALUE.first_trade });
    }
  }

  return events;
}

/**
 * Stamps the ad click that brought this account in, from the cookie middleware
 * left behind. Called from `auth.events.createUser`, next to the referral claim,
 * so it happens server-side and survives an ad-blocker.
 *
 * Never fatal and never overwrites: the first campaign to bring someone in is
 * the one that earned them, and a failure here must not fail a sign-in.
 */
export async function claimAdAttribution(userId: string, cookieValue: string | undefined): Promise<void> {
  const attr: AdAttribution | null = parseAdAttribution(cookieValue);
  if (!attr) return;
  try {
    const db = await getDb();
    await db
      .update(users)
      .set({
        gclid: attr.gclid ?? null,
        utmSource: attr.utmSource ?? null,
        utmMedium: attr.utmMedium ?? null,
        utmCampaign: attr.utmCampaign ?? null,
        utmContent: attr.utmContent ?? null,
      })
      .where(and(eq(users.id, userId), isNull(users.gclid), isNull(users.utmSource)));
  } catch (err) {
    console.error("[ads] attribution claim failed", err);
  }
}
