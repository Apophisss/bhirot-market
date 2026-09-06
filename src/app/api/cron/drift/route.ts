import { NextResponse } from "next/server";
import { isAuthorizedAdmin, unauthorized } from "@/lib/api-auth";
import { runMarketDrift } from "@/lib/market-drift";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The short clock (see docker-compose.yml): nudges the quote of every market
 * nobody has answered in hours, so the board is never frozen mid-visit. The
 * policy — how far, how often, and which markets are left alone — is entirely in
 * `src/lib/drift.ts`; this route is a trigger with an auth check.
 *
 * `?dry=1` plans without writing, which is how to see what the next run would do, and
 * `?verbose=1` lists every market it moved instead of the first few — the clock logs
 * whatever comes back, every ten minutes, and a full list is a megabyte of docker log
 * a day for a number nobody reads.
 * Auth: `Authorization: Bearer ${CRON_SECRET}`; ADMIN_TOKEN also works.
 */
export async function GET(req: Request) {
  if (!isAuthorizedAdmin(req, { allowCron: true })) return unauthorized();
  const params = new URL(req.url).searchParams;
  const { steps, ...run } = await runMarketDrift({ dryRun: params.get("dry") === "1" });
  return NextResponse.json({ ...run, steps: params.get("verbose") === "1" ? steps : steps.slice(0, 5) });
}
