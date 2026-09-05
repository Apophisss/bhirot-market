import { listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { renderLlmsTxt, LLMS_OPEN_LIMIT, LLMS_RESOLVED_LIMIT } from "@/lib/llms-txt";

export const dynamic = "force-dynamic";

/**
 * `/llms.txt` — the board in Markdown, for assistants that read a site instead of
 * rendering it (llmstxt.org). Served as text/plain so it opens in a browser too;
 * what goes in it is decided in `src/lib/llms-txt.ts`.
 */
export async function GET() {
  await ensureSynced();
  const [open, resolved] = await Promise.all([
    // "trending" is featured → volume → newest, so a truncated list keeps the questions that matter
    listMarkets({ status: "open", sort: "trending", limit: LLMS_OPEN_LIMIT * 2 }),
    listMarkets({ status: "resolved", sort: "newest", limit: LLMS_RESOLVED_LIMIT * 4 }),
  ]);
  return new Response(renderLlmsTxt({ open, resolved }), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // prices move with every trade, but nobody needs the file to the second
      "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
