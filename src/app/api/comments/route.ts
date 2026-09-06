import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * Ten comments an hour from one account.
 *
 * A comment is published under a question on a political board during an
 * election campaign, and it is the one thing here a visitor can write that
 * everybody else reads. Ten an hour is more than a conversation ever needs and
 * far less than a flood — the same order as the suggestion form beside it.
 */
const PER_HOUR = 10;

const Body = z.object({ marketId: z.string().min(1), body: z.string().trim().min(1).max(1000) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false, error: "צריך להתחבר" }, { status: 401 });
  const limited = rateLimit(`comment:${clientKey(req, session.user.id)}`, PER_HOUR, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "נשלחו יותר מדי תגובות. נסו שוב מאוחר יותר." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "תגובה לא תקינה" }, { status: 400 });
  const db = await getDb();
  const market = await db.query.markets.findFirst({ where: eq(schema.markets.id, parsed.data.marketId) });
  if (!market) return NextResponse.json({ ok: false, error: "השוק לא נמצא" }, { status: 404 });
  const [row] = await db
    .insert(schema.comments)
    .values({ userId: session.user.id, marketId: market.id, body: parsed.data.body })
    .returning();
  await track(EVENTS.comment, {
    req,
    userId: session.user.id,
    marketId: market.id,
    path: `/market/${market.id}`,
    props: { length: parsed.data.body.length },
  });
  return NextResponse.json({ ok: true, comment: row });
}
