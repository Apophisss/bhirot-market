import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { recordRapidSkips } from "@/lib/rapid-feed";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** how many skips one request may carry — the deck batches, and a run is sixty cards long */
const MAX_IDS = 60;

const Body = z.object({
  marketIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
});

/**
 * "לא עכשיו" — the questions the user passed on in rapid mode.
 *
 * The counterpart of `POST /api/rapid/answer`: that one binds money, this one
 * only records that the deck should stop offering these questions. Nothing here
 * is reversible from the outside and nothing is spent, so a failure is silent by
 * design — the browser has its own copy of the list (src/lib/rapid-skips.ts) and
 * the run carries on either way.
 *
 * A signed-out visitor has nowhere to write to, so they get a plain 401 and keep
 * their skips in the browser alone.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "צריך להתחבר", code: "UNAUTHORIZED" }, { status: 401 });
  }
  // a whole run is a handful of batched requests; this only stops a loop
  const limited = rateLimit(`rapid-skip:${clientKey(req, userId)}`, 120, 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "יותר מדי בקשות", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "בקשה לא תקינה", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const saved = await recordRapidSkips(userId, parsed.data.marketIds);
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("[rapid] skip failed", err);
    return NextResponse.json({ ok: false, error: "שגיאה בשמירת הדילוג", code: "UNKNOWN" }, { status: 500 });
  }
}
