import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { unauthorized } from "@/lib/api-auth";
import { buildBundle, bundleToMarkdown } from "@/lib/bundle";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The analysis bundle: everything known about the site in one file, meant to be handed
 * to an agent ("קח את הקובץ הזה ותשפר לי את האתר"). Admin only.
 *
 *   GET /api/admin/bundle?days=90&format=json|md&download=1
 *   Authorization: Bearer <ADMIN_TOKEN>   (or the admin cookie, for the browser button)
 */
export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized();
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 90);
  const markets = Number(url.searchParams.get("markets") ?? 300);
  const format = url.searchParams.get("format") === "md" ? "md" : "json";
  const download = url.searchParams.get("download") !== "0";

  const bundle = await buildBundle({
    days: Number.isFinite(days) ? days : 90,
    markets: Number.isFinite(markets) ? markets : 300,
  });
  void track(EVENTS.bundleDownload, { req, path: "/api/admin/bundle", props: { format, days: bundle.meta.rangeDays } });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `bhirot-market-${stamp}.${format === "md" ? "md" : "json"}`;
  const body = format === "md" ? bundleToMarkdown(bundle) : JSON.stringify(bundle, null, 2);
  return new NextResponse(body, {
    headers: {
      "content-type": format === "md" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(download ? { "content-disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}
