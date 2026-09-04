import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedAdmin, unauthorized } from "@/lib/api-auth";
import { MarketContentSchema } from "@/lib/content";
import { upsertMarkets, logAgentRun } from "@/lib/sync";
import { listMarkets } from "@/lib/markets";

export const dynamic = "force-dynamic";

const Body = z.object({
  markets: z.array(MarketContentSchema).min(1).max(100),
  note: z.string().max(2000).optional(),
  source: z.string().max(40).default("routine"),
});

/**
 * Upsert / resolve markets directly (used by the Claude routine for instant updates,
 * without waiting for a redeploy). Auth: Bearer ADMIN_TOKEN.
 * Body: { markets: MarketContent[], note?: string, source?: string }
 */
export async function POST(req: Request) {
  if (!isAuthorizedAdmin(req)) return unauthorized();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { markets, note, source } = parsed.data;
  const result = await upsertMarkets(markets, source);
  await logAgentRun(source, note ?? `עדכון דרך API: ${markets.length} שווקים`, result);
  return NextResponse.json({ ok: true, ...result });
}

/** Full export of all markets (including resolved), for the routine's dedupe step. */
export async function GET(req: Request) {
  if (!isAuthorizedAdmin(req)) return unauthorized();
  const markets = await listMarkets({ status: "all", limit: 1000 });
  return NextResponse.json({ ok: true, markets });
}
