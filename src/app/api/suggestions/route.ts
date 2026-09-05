import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { SuggestionInputSchema, createSuggestion } from "@/lib/inbox";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * A user proposes a question. It lands in the editorial inbox as a suggestion —
 * nothing here creates a market, and nothing here reaches the board on its own.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const limited = rateLimit(`suggest:${clientKey(req, userId)}`, 10, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "נשלחו יותר מדי הצעות. נסו שוב מאוחר יותר." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  const parsed = SuggestionInputSchema.safeParse(await req.json().catch(() => null));
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

  const suggestion = await createSuggestion(parsed.data, user);
  // server-side: the form posts from a page an ad-blocker may have stripped the
  // browser tracker from, and a proposed question is too rare an event to lose
  await track(EVENTS.suggestion, { req, userId, path: "/suggest", props: { loggedIn: userId ? 1 : 0 } });
  return NextResponse.json({ ok: true, id: suggestion.id });
}
