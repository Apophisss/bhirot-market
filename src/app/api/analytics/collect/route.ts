import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { recordEvents, requestContext } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const Event = z.object({
  name: z.string().min(1).max(40),
  path: z.string().max(300).optional(),
  query: z.string().max(300).optional(),
  referrer: z.string().max(80).optional(),
  source: z.string().max(80).optional(),
  medium: z.string().max(40).optional(),
  campaign: z.string().max(80).optional(),
  sessionId: z.string().max(40).optional(),
  marketId: z.string().max(120).optional(),
  value: z.number().finite().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const Body = z.object({ events: z.array(Event).min(1).max(30) });

/** Very small in-memory guard so one browser can't flood the log. */
const seen = new Map<string, { n: number; until: number }>();
const PER_MINUTE = 240;

function allowed(visitorId: string, n: number): boolean {
  const now = Date.now();
  const cur = seen.get(visitorId);
  if (!cur || cur.until < now) {
    seen.set(visitorId, { n, until: now + 60_000 });
    if (seen.size > 5000) for (const [k, v] of seen) if (v.until < now) seen.delete(k);
    return true;
  }
  cur.n += n;
  return cur.n <= PER_MINUTE;
}

/**
 * The site's own analytics collector. Called by `src/components/Analytics.tsx`
 * with `navigator.sendBeacon`, so it must stay fast and always answer 204.
 */
export async function POST(req: Request) {
  const ctx = requestContext(req);
  let parsed;
  try {
    parsed = Body.safeParse(JSON.parse(await req.text()));
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (!parsed.success || ctx.isBot || !allowed(ctx.visitorId, parsed.data.events.length)) {
    return new NextResponse(null, { status: 204 });
  }
  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? null;
  await recordEvents(
    parsed.data.events.map((e) => ({ ...e, userId })),
    ctx,
  );
  return new NextResponse(null, { status: 204 });
}
