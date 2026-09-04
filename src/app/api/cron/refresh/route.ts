import { NextResponse } from "next/server";
import { isAuthorizedAdmin, unauthorized } from "@/lib/api-auth";
import { syncFromContent } from "@/lib/sync";
import { runQuestionGenerator } from "@/lib/agent/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Hourly job (Vercel Cron, see vercel.json):
 *  1. sync data/markets.json -> DB (picks up anything the Claude routine committed)
 *  2. if ANTHROPIC_API_KEY is set, ask Claude (with web search) for new, current questions
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
  return NextResponse.json({ ok: true, sync, generator });
}
