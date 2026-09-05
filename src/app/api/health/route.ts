import { NextResponse } from "next/server";
import { getMarketStats, getLastAgentRun } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { analyticsHealth } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSynced();
  // `analytics` is counts only, so that "did the tracking stop?" is answerable
  // from outside the admin area — by a monitor, or by whoever is on call.
  const [stats, last, analytics] = await Promise.all([getMarketStats(), getLastAgentRun(), analyticsHealth()]);
  return NextResponse.json({ ok: true, stats, analytics, lastAgentRun: last ?? null, now: new Date().toISOString() });
}
