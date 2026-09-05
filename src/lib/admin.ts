import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { isAuthorizedAdmin } from "./api-auth";
import { getDb, schema } from "./db";

/**
 * Who may open /admin.
 *
 * The allowlist is an env var rather than a database flag on purpose: the dashboard
 * is the one place that can publish questions and read every message users sent, so
 * membership must not be grantable from inside the running site.
 *
 * ADMIN_EMAILS="editor@example.com, second@example.com"
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const list = adminEmails();
  if (!list.length) return false;
  return list.includes(email.trim().toLowerCase());
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

/** The signed-in user, but only when their email is on the allowlist. */
export async function currentAdmin(): Promise<AdminUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const db = await getDb();
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!row?.email || !isAdminEmail(row.email)) return null;
  return { id: row.id, name: row.name, email: row.email, image: row.image };
}

/**
 * Authorises an admin API call. Two ways in: a signed-in allowlisted user (the
 * dashboard) or `Authorization: Bearer ADMIN_TOKEN` (the editorial routine).
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  if (isAuthorizedAdmin(req)) return true;
  return (await currentAdmin()) !== null;
}

/** True when nobody can reach the dashboard yet, so the page can say what to set. */
export function adminAllowlistEmpty(): boolean {
  return adminEmails().length === 0;
}
