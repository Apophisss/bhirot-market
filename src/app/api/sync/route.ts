import { NextResponse } from "next/server";
import { isAuthorizedAdmin, unauthorized } from "@/lib/api-auth";
import { syncFromContent } from "@/lib/sync";

export const dynamic = "force-dynamic";

/** Re-syncs the bundled data/markets.json into the DB. Auth: Bearer ADMIN_TOKEN. */
export async function POST(req: Request) {
  if (!isAuthorizedAdmin(req)) return unauthorized();
  const result = await syncFromContent("api-sync");
  return NextResponse.json({ ok: true, ...result });
}
