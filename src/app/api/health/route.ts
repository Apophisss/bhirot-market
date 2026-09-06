import { NextResponse } from "next/server";
import { getMarketStats, getLastAgentRun } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { analyticsHealth } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * The commit the running image was built from (`Dockerfile`, `deploy.yml`).
 * "dev" is a build no deploy produced — a local `next build`, or CI.
 */
const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";

export async function GET() {
  await ensureSynced();
  // `analytics` is counts only, so that "did the tracking stop?" is answerable
  // from outside the admin area — by a monitor, or by whoever is on call.
  const [stats, last, analytics] = await Promise.all([getMarketStats(), getLastAgentRun(), analyticsHealth()]);
  // `build` is the first thing to check after a deploy: it says which commit is
  // actually serving, which is otherwise only knowable by reading the server's
  // .env over ssh — and it is the same stamp every measured number carries.
  return NextResponse.json({ ok: true, build: BUILD, stats, analytics, lastAgentRun: last ?? null, now: new Date().toISOString() });
}
