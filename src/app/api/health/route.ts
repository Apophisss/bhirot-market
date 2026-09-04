import { NextResponse } from "next/server";
import { getMarketStats, getLastAgentRun } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSynced();
  const [stats, last] = await Promise.all([getMarketStats(), getLastAgentRun()]);
  return NextResponse.json({ ok: true, stats, lastAgentRun: last ?? null, now: new Date().toISOString() });
}
