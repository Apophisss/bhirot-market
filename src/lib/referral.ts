/**
 * The invite programme, in numbers and strings.
 *
 * Dependency-free leaf module (like `limits.ts` and `rapid.ts`) so the share card
 * running in the browser, the middleware that stamps the cookie and the server that
 * pays the bonus all quote exactly the same offer. The database side lives in
 * `referral-program.ts`.
 */
import { SITE_NAME, SITE_URL } from "./config";

/** Points credited to the inviter for every friend who signs up through their link. */
export const REFERRAL_BONUS = 2000;

/**
 * How many paid invites a single account gets. Past this the link keeps working and
 * the invite is still recorded — it just stops paying, so a script that farms signups
 * can't mint unlimited play money into the leaderboard.
 */
export const MAX_REFERRALS = 50;

/** Cookie that carries the code from the invite landing page to the moment the account is created. */
export const REFERRAL_COOKIE = "bm_ref";
/** 30 days: long enough that "I'll sign up later" still credits the friend who sent the link. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const REFERRAL_CODE_LENGTH = 7;
/** No 0/1/i/l/o: codes get read off a screen and dictated over the phone. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** A fresh code. Uniqueness is the database's job — `getOrCreateReferralCode()` retries on collision. */
export function generateReferralCode(length = REFERRAL_CODE_LENGTH): string {
  let code = "";
  while (code.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      // 248 = 8 × 31, the largest multiple of the alphabet inside a byte: dropping the
      // rest keeps every character equally likely instead of favouring the first eight.
      if (byte >= 248) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
}

/**
 * The code as it is stored and compared, or `null` if it could never be one of ours.
 * Accepts the sloppy forms a shared link arrives in: a trailing slash, a stray query
 * string, capitals from an autocorrecting keyboard.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = decodeURIComponent(raw.trim()).toLowerCase().replace(/^\/+|\/+$/g, "").split(/[?#/]/)[0];
  return code.length >= 4 && code.length <= 16 && /^[a-z0-9]+$/.test(code) ? code : null;
}

/** Site-relative path of a personal invite link. */
export function invitePath(code: string): string {
  return `/i/${code}`;
}

/**
 * Absolute invite link, always on the canonical site URL rather than on whatever host
 * the browser happens to be: a link copied from a preview deployment should still send
 * friends to the real site.
 */
export function inviteUrl(code: string): string {
  return `${SITE_URL.replace(/\/+$/, "")}${invitePath(code)}`;
}

/** The message that goes out on WhatsApp — the link on its own line, so every client links it. */
export function inviteShareText(url: string): string {
  return `בואו לנחש איתי את הבחירות ב${SITE_NAME} — משחק ניחושים חינמי על בחירות 2026. נרשמים דרך הקישור שלי ומתחילים עם 10,000 נקודות:\n${url}`;
}
