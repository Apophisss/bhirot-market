import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/**
 * Constant-time string comparison.
 *
 * `===` on a secret returns as soon as two bytes differ, so the time it takes to
 * refuse a token says how much of the token was right — and this one guards
 * every admin endpoint, including the data bundle. `timingSafeEqual` needs equal
 * lengths, so the lengths are compared first; that leaks the length of the token
 * and nothing about its contents, which is the trade everyone makes here.
 */
function equals(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True when the request carries ADMIN_TOKEN (or CRON_SECRET, for cron endpoints). */
export function isAuthorizedAdmin(req: Request, opts: { allowCron?: boolean } = {}): boolean {
  const token = bearer(req);
  if (!token) return false;
  const admin = process.env.ADMIN_TOKEN;
  if (admin && equals(token, admin)) return true;
  if (opts.allowCron) {
    const cron = process.env.CRON_SECRET;
    if (cron && equals(token, cron)) return true;
  }
  return false;
}

export function unauthorized(message = "unauthorized") {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}
