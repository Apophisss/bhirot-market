import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { executeTrade, isBusyError, TradeError } from "@/lib/trade";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE } from "@/lib/rapid";

export const dynamic = "force-dynamic";

/**
 * One answer in "מצב זריז": a binding BUY of `stake` ₪ on one side of one market.
 *
 * Same engine as /api/trade, but the stake band lives on the endpoint rather than
 * in the request, so the client cannot opt out of it, and `action` is pinned to
 * BUY — rapid mode can never sell. The engine's own MIN_TRADE/MAX_TRADE bounds
 * stay untouched; they still serve the full trade panel.
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
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: `סכום התשובה חייב להיות מספר שלם בין ₪${RAPID_MIN_STAKE} ל־₪${RAPID_MAX_STAKE}`, code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  const { marketId, side, stake } = parsed.data;

  try {
    const r = await executeTrade({ userId: session.user.id, marketId, side, action: "BUY", quantity: stake });
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
