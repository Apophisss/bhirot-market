import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ContactInputSchema, createContactMessage } from "@/lib/inbox";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

/** "Contact the team". Open to signed-out visitors too, hence the rate limit. */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const limited = rateLimit(`contact:${clientKey(req, userId)}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "נשלחו יותר מדי הודעות. נסו שוב מאוחר יותר." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  const parsed = ContactInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "הטופס לא תקין" },
      { status: 400 },
    );
  }

  let user = null;
  if (userId) {
    const db = await getDb();
    const row = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (row) user = { id: row.id, name: row.name, email: row.email };
  }

  const message = await createContactMessage(parsed.data, user);
  await track(EVENTS.contactMessage, { req, userId, path: "/contact", props: { loggedIn: userId ? 1 : 0 } });
  return NextResponse.json({ ok: true, id: message.id });
}
