import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { executeTrade, isBusyError, TradeError } from "@/lib/trade";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE } from "@/lib/rapid";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * The ceiling on answers from one account, per minute — deliberately far above
 * real play: the deck is meant to be fast, a quick run is a card every few
 * seconds, and nobody who is actually reading the questions will ever meet it.
 * What it stops is a loop.
 *
 * The quota is shared with /api/trade (the same `trade:` key), because it is one
 * ceiling on how fast one account may move money, not one per screen.
 */
const PER_MINUTE = 60;

/**
 * One answer in "מצב זריז": a binding BUY of `stake` points on one side of one question.
 *
 * Same engine as /api/trade, but the stake band lives on the endpoint rather than
 * in the request, so the client cannot opt out of it, and `action` is pinned to
 * BUY — rapid mode can never sell. The upper end of the band is the site-wide bet
 * cap (`MAX_BET`), the same one the full trade panel and `executeTrade()` enforce.
 */
const Body = z.object({
  marketId: z.string().min(1),
  side: z.enum(["YES", "NO"]),
  stake: z.number().int().min(RAPID_MIN_STAKE).max(RAPID_MAX_STAKE),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "צריך להתחבר כדי לענות", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const limited = rateLimit(`trade:${clientKey(req, session.user.id)}`, PER_MINUTE, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "יותר מדי תשובות בזמן קצר — רגע אחד", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: `התשובה חייבת להיות מספר שלם של נקודות בין ${RAPID_MIN_STAKE} ל־${RAPID_MAX_STAKE}`, code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  const { marketId, side, stake } = parsed.data;

  try {
    const r = await executeTrade({ userId: session.user.id, marketId, side, action: "BUY", quantity: stake });
    await track(EVENTS.trade, {
      req,
      userId: session.user.id,
      marketId,
      path: "/rapid",
      value: r.quote.amount,
      props: { side, action: "BUY", rapid: 1, shares: Math.round(r.quote.shares * 100) / 100 },
    });
    return NextResponse.json({
      ok: true,
      marketId,
      side,
      stake,
      shares: r.quote.shares,
      amount: r.quote.amount,
      avgPrice: r.quote.avgPrice,
      priceAfter: r.quote.priceAfter,
      payout: r.quote.payout,
      balance: r.balance,
      probability: r.probability,
    });
  } catch (err) {
    if (err instanceof TradeError) {
      await track(EVENTS.tradeError, {
        req,
        userId: session.user.id,
        marketId,
        path: "/rapid",
        props: { reason: err.message, side, rapid: 1 },
      });
      return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: err.status });
    }
    if (isBusyError(err)) {
      // the engine already retried; tell the client this one is worth another try
      return NextResponse.json({ ok: false, error: "השרת עמוס — נסו שוב", code: "BUSY" }, { status: 503 });
    }
    console.error("[rapid] answer failed", err);
    return NextResponse.json({ ok: false, error: "שגיאה בביצוע העסקה", code: "UNKNOWN" }, { status: 500 });
  }
}
