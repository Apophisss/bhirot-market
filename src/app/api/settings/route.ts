import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { claimSettings, getSettings, saveSettings } from "@/lib/settings-store";
import { sanitizeSettings } from "@/lib/settings";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * ההגדרות של המשתמש המחובר — הסכום לתשובה, סדר החפיסה, "כולל שאלות שכבר עניתי".
 *
 * PATCH  — שינוי מפורש שהמשתמש עשה עכשיו (הסליידר, כפתור מיון).
 * POST   — אימוץ מה שנבחר לפני ההתחברות: ממלא רק את מה שהחשבון עוד לא בחר,
 *          כדי שאורח שהחליף מכשיר לא ידרוס בחירה מאוחרת יותר של אותו חשבון.
 *
 * אורח מקבל 401 ולא שגיאה מנומקת: אין לו איפה לשמור בשרת, וצד הדפדפן יודע את זה
 * מראש ולא שולח (`settings-client.ts`) — התשובה הזאת היא הגדר, לא המסלול.
 */

function unauthorized() {
  return NextResponse.json({ ok: false, error: "צריך להתחבר" }, { status: 401 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  return NextResponse.json({ ok: true, settings: await getSettings(session.user.id) });
}

async function write(req: Request, mode: "set" | "claim") {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  // הסליידר כבר מושהה בצד הדפדפן, וזו רק התקרה: כתיבה של העדפה היא זולה, אבל
  // לולאה תקועה בלשונית פתוחה לא צריכה להגיע למסד שוב ושוב
  const limited = rateLimit(`settings:${clientKey(req, session.user.id)}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "יותר מדי שינויים — רגע אחד" },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  const patch = sanitizeSettings(await req.json().catch(() => null));
  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, error: "אין מה לשמור" }, { status: 400 });
  }
  const settings = mode === "claim"
    ? await claimSettings(session.user.id, patch)
    : await saveSettings(session.user.id, patch);
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(req: Request) {
  return write(req, "set");
}

export async function POST(req: Request) {
  return write(req, "claim");
}
