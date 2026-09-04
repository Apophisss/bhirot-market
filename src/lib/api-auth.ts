import { NextResponse } from "next/server";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** True when the request carries ADMIN_TOKEN (or CRON_SECRET, for cron endpoints). */
export function isAuthorizedAdmin(req: Request, opts: { allowCron?: boolean } = {}): boolean {
  const token = bearer(req);
  if (!token) return false;
  const admin = process.env.ADMIN_TOKEN;
  if (admin && token === admin) return true;
  if (opts.allowCron) {
    const cron = process.env.CRON_SECRET;
    if (cron && token === cron) return true;
  }
  return false;
}

export function unauthorized(message = "unauthorized") {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}
