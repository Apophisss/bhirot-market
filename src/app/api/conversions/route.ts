import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { claimAdConversions } from "@/lib/ad-conversions";

export const dynamic = "force-dynamic";

/**
 * Which Google Ads conversions the browser still owes for the signed-in user.
 * The decision — and the "already reported" mark — is made server-side, so a
 * refresh cannot report the same signup twice.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ events: [] });
  return NextResponse.json({ events: await claimAdConversions(session.user.id) });
}
