import { NextResponse } from "next/server";
import { isAuthorizedAdmin, unauthorized } from "@/lib/api-auth";
import { syncFromContent } from "@/lib/sync";
import { runQuestionGenerator } from "@/lib/agent/generate";
import { pruneAnalytics } from "@/lib/analytics";
import { runMarketDrift } from "@/lib/market-drift";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Hourly job (Vercel Cron, see vercel.json):
 *  1. sync data/markets.json -> DB (picks up anything the editorial routine committed)
 *  2. if an API key is configured, run the built-in question generator (with web search) for new, current questions
 *  3. drop analytics events past their retention window, so the log cannot grow without bound
 *  4. nudge the quote of every market nobody has answered in hours (`/api/cron/drift`
 *     is the short clock for the same job; this call is the safety net for a
 *     deployment that only has the hourly one)
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`; ADMIN_TOKEN also works.
 */
export async function GET(req: Request) {
  if (!isAuthorizedAdmin(req, { allowCron: true })) return unauthorized();
  const sync = await syncFromContent("cron-sync");
  let generator: Awaited<ReturnType<typeof runQuestionGenerator>> | { skipped: true; reason: string };
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      generator = await runQuestionGenerator({ source: "cron" });
    } catch (err) {
      console.error("[cron] generator failed", err);
      generator = { skipped: true, reason: err instanceof Error ? err.message : String(err) };
    }
  } else {
    generator = { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
  }
  const pruned = await pruneAnalytics().catch((err) => {
    console.error("[cron] analytics prune failed", err);
    return 0;
  });
  // the per-market list is dropped here: this response is logged once an hour by the
  // clock container, and the counts are what anyone reads. `/api/cron/drift?verbose=1`
  // is where the whole list lives.
  const drift = await runMarketDrift()
    .then(({ steps, ...run }) => ({ ...run, moved: steps.length }))
    .catch((err) => {
      console.error("[cron] market drift failed", err);
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    });
  return NextResponse.json({ ok: true, sync, generator, analyticsPruned: pruned, drift });
}
