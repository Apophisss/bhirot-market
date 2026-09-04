import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({ marketId: z.string().min(1), body: z.string().trim().min(1).max(1000) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false, error: "צריך להתחבר" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "תגובה לא תקינה" }, { status: 400 });
  const db = await getDb();
  const market = await db.query.markets.findFirst({ where: eq(schema.markets.id, parsed.data.marketId) });
  if (!market) return NextResponse.json({ ok: false, error: "השוק לא נמצא" }, { status: 404 });
  const [row] = await db
    .insert(schema.comments)
    .values({ userId: session.user.id, marketId: market.id, body: parsed.data.body })
    .returning();
  return NextResponse.json({ ok: true, comment: row });
}
