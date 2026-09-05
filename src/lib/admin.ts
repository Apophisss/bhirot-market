import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "./auth";
import { isAuthorizedAdmin } from "./api-auth";

/**
 * Who may open /admin and download the data bundle:
 *  1. anyone who typed ADMIN_TOKEN into /admin/login (kept as a signed cookie, never the token itself)
 *  2. a signed-in user whose email is listed in ADMIN_EMAILS
 *  3. locally, when neither is configured, so `npm run dev` just works
 * API clients keep using `Authorization: Bearer <ADMIN_TOKEN>` exactly as before.
 */
export const ADMIN_COOKIE = "bm_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function adminTokenConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}

/** No token and no admin emails outside production: the dashboard is open locally. */
export function adminOpenInDev(): boolean {
  return process.env.NODE_ENV !== "production" && !adminTokenConfigured() && adminEmails().length === 0;
}

function equals(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The cookie holds an HMAC of a constant keyed by ADMIN_TOKEN — leaking it does not leak the token. */
function cookieValue(): string | null {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) return null;
  return createHmac("sha256", secret).update("bhirot-admin-v1").digest("hex");
}

export function checkAdminToken(token: string): boolean {
  const secret = process.env.ADMIN_TOKEN;
  return Boolean(secret && token) && equals(token, secret!);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export function adminCookieValue(): string | null {
  return cookieValue();
}

/** Admin check for pages and server actions. */
export async function isAdmin(): Promise<boolean> {
  if (adminOpenInDev()) return true;
  const expected = cookieValue();
  const jar = await cookies();
  const got = jar.get(ADMIN_COOKIE)?.value;
  if (expected && got && equals(got, expected)) return true;
  const emails = adminEmails();
  if (!emails.length) return false;
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  return Boolean(email && emails.includes(email));
}

/** Admin check for route handlers: Bearer token, or the browser cookie/session of a logged-in admin. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  if (isAuthorizedAdmin(req)) return true;
  return isAdmin();
}

/** How the current visitor got in — shown on the dashboard so it is obvious when dev mode is open. */
export async function adminMode(): Promise<"dev" | "cookie" | "email" | "none"> {
  if (adminOpenInDev()) return "dev";
  const expected = cookieValue();
  const jar = await cookies();
  const got = jar.get(ADMIN_COOKIE)?.value;
  if (expected && got && equals(got, expected)) return "cookie";
  const emails = adminEmails();
  if (emails.length) {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    if (email && emails.includes(email)) return "email";
  }
  return "none";
}
