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

/**
 * The cookie is `<issued-at>.<HMAC of it, keyed by ADMIN_TOKEN>`.
 *
 * Leaking it still does not leak the token, and now it does not last forever
 * either: the signed value used to be an HMAC of a constant, so one cookie
 * copied off a laptop stayed valid until somebody rotated ADMIN_TOKEN — which
 * logs every admin out and has to be done by hand, so nobody ever does it. With
 * the timestamp inside the signature the cookie ages out on its own, and a
 * forged timestamp does not verify.
 *
 * The login flow README documents is unchanged: type ADMIN_TOKEN at
 * /admin/login, get a cookie for thirty days. Cookies issued by the previous
 * version no longer verify, so whoever is signed in signs in once more.
 */
const COOKIE_VERSION = "bhirot-admin-v2";

function sign(issuedAt: number): string | null {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`${COOKIE_VERSION}:${issuedAt}`).digest("hex");
}

/** Is this cookie one we signed, and is it still inside its thirty days? */
export function adminCookieValid(value: string | undefined | null, now = Date.now()): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const issuedAt = Number(value.slice(0, dot));
  const mac = value.slice(dot + 1);
  if (!Number.isInteger(issuedAt) || !mac) return false;
  const expected = sign(issuedAt);
  if (!expected || !equals(mac, expected)) return false;
  const age = now / 1000 - issuedAt;
  // a minute of tolerance backwards for clock skew between issuing and reading;
  // anything further in the future is not a clock, it is a made-up stamp
  return age >= -60 && age <= COOKIE_MAX_AGE;
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

/** A freshly stamped cookie, for the moment someone proves they have the token. */
export function adminCookieValue(now = Date.now()): string | null {
  const issuedAt = Math.floor(now / 1000);
  const mac = sign(issuedAt);
  return mac ? `${issuedAt}.${mac}` : null;
}

/** Admin check for pages and server actions. */
export async function isAdmin(): Promise<boolean> {
  if (adminOpenInDev()) return true;
  const jar = await cookies();
  if (adminCookieValid(jar.get(ADMIN_COOKIE)?.value)) return true;
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
  const jar = await cookies();
  if (adminCookieValid(jar.get(ADMIN_COOKIE)?.value)) return "cookie";
  const emails = adminEmails();
  if (emails.length) {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    if (email && emails.includes(email)) return "email";
  }
  return "none";
}
