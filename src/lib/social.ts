/**
 * The social layer, in numbers and strings: friends and leagues.
 *
 * Dependency-free leaf module (like `limits.ts`, `rapid.ts` and `referral.ts`) so the
 * search box, the league invite card and the server routes that enforce the same
 * limits all quote one set of rules. The database sides live in `friends.ts` and
 * `leagues.ts`.
 *
 * ## What a friend may see, and what nobody may see
 *
 * The public leaderboard is anonymous on purpose (`fake-leaderboard.ts`). Friends and
 * leagues are the deliberate exception, and they are an exception by consent: a name
 * and an avatar reach another account only after that account accepted, or after both
 * joined the same league.
 *
 * Even then the score is an aggregate — total points, how many open positions, how
 * many answers. **Which** questions someone answered, and on which side, is never
 * exposed: that would turn a friends list into a way to copy somebody's book, and it
 * is the one thing this whole feature must not do. `FRIEND_STAT_FIELDS` below is the
 * closed list, and `scripts/test-friends.ts` asserts nothing else ever leaks.
 */
import { SITE_NAME, SITE_URL } from "./config";

/* ---------- friends ---------- */

/** Shortest search that is allowed to hit the user table — one letter matches half the site. */
export const FRIEND_SEARCH_MIN = 2;
/** Longest query we bother sending; anything past this is a paste, not a name. */
export const FRIEND_SEARCH_MAX = 40;
/** How many people one search may return. */
export const FRIEND_SEARCH_LIMIT = 10;
/**
 * Friend requests one account may have outstanding at once. It is the only real
 * defence against someone spraying requests at every name they can find.
 */
export const MAX_PENDING_REQUESTS = 50;
/** Hard cap on a friends list, so the page stays one query and one screen. */
export const MAX_FRIENDS = 300;

/**
 * The complete set of numbers a friend is shown about another friend. Anything not on
 * this list — a market id, a side, a price, an answer — must never leave the server.
 */
export const FRIEND_STAT_FIELDS = ["netWorth", "pnl", "openPositions", "tradeCount"] as const;

/* ---------- leagues ---------- */

export const LEAGUE_NAME_MIN = 2;
export const LEAGUE_NAME_MAX = 40;
/** Members in one league. A league is people you know, not a second leaderboard. */
export const MAX_LEAGUE_MEMBERS = 100;
/** Leagues one account may be in (owned or joined), so the page stays scannable. */
export const MAX_LEAGUES_PER_USER = 20;
/** Leagues one account may create — lower than the above: opening leagues is the cheap part. */
export const MAX_LEAGUES_OWNED = 10;

export const LEAGUE_CODE_LENGTH = 8;
/** No 0/1/i/l/o: codes get read off a screen and dictated over the phone. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** A fresh league code. Uniqueness is the database's job — `createLeague()` retries on collision. */
export function generateLeagueCode(length = LEAGUE_CODE_LENGTH): string {
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
 * Accepts the shapes a pasted link arrives in — a whole URL, a trailing slash, a query
 * string, capitals from an autocorrecting keyboard — because people paste the link,
 * not the code.
 */
export function normalizeLeagueCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // a stray % in a pasted string is not a reason to reject it out of hand
  }
  // take the last path segment, so a full https://…/l/abcd1234 link works as typed
  const last = value.toLowerCase().replace(/^\/+|\/+$/g, "").split(/[?#]/)[0].split("/").pop() ?? "";
  return last.length >= 4 && last.length <= 16 && /^[a-z0-9]+$/.test(last) ? last : null;
}

/** A league name as it is stored: collapsed whitespace, capped, or `null` if there is nothing left. */
export function normalizeLeagueName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, LEAGUE_NAME_MAX);
  return name.length >= LEAGUE_NAME_MIN ? name : null;
}

/** Site-relative path of a league invite link. */
export function leaguePath(code: string): string {
  return `/l/${code}`;
}

/**
 * Absolute league invite link, always on the canonical site URL rather than on whatever
 * host the browser happens to be: a link copied from a preview deployment should still
 * send friends to the real site.
 */
export function leagueUrl(code: string): string {
  return `${SITE_URL.replace(/\/+$/, "")}${leaguePath(code)}`;
}

/** The message that goes out on WhatsApp — the link on its own line, so every client links it. */
export function leagueShareText(name: string, url: string): string {
  return `הצטרפו לליגה "${name}" ב${SITE_NAME} — מנחשים את הבחירות, ורואים מי מוביל בינינו:\n${url}`;
}
