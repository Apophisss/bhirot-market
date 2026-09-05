import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { executeTrade, TradeError } from "@/lib/trade";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

const Body = z.object({
  marketId: z.string().min(1),
  side: z.enum(["YES", "NO"]),
  action: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "צריך להתחבר כדי לסחור" }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "בקשה לא תקינה" }, { status: 400 });
  }
  try {
    const result = await executeTrade({ userId: session.user.id, ...parsed.data });
    await track(EVENTS.trade, {
      req,
      userId: session.user.id,
      marketId: parsed.data.marketId,
      path: `/market/${parsed.data.marketId}`,
      value: result.quote.amount,
      props: {
        side: parsed.data.side,
        action: parsed.data.action,
        shares: Math.round(result.quote.shares * 100) / 100,
        priceAfter: Math.round(result.probability * 1000) / 1000,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof TradeError) {
      await track(EVENTS.tradeError, {
        req,
        userId: session.user.id,
        marketId: parsed.data.marketId,
        path: `/market/${parsed.data.marketId}`,
        props: { reason: err.message, side: parsed.data.side, action: parsed.data.action },
      });
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error("[trade] failed", err);
    return NextResponse.json({ ok: false, error: "שגיאה בביצוע העסקה" }, { status: 500 });
  }
}
