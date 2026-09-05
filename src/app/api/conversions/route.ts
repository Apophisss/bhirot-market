import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { claimConversions } from "@/lib/conversions";
import { ATTR_COOKIE, parseAttribution } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** Tells the browser which conversions it still owes Google for the signed-in user. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ events: [] });
  const attr = parseAttribution((await cookies()).get(ATTR_COOKIE)?.value);
  return NextResponse.json({ events: await claimConversions(session.user.id, attr) });
}
