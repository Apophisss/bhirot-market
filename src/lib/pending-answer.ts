/**
 * The answer a logged-out visitor gave before they had an account.
 *
 * Rapid mode used to send them to /login and drop the answer on the floor: they
 * came back to a deck reset to 1/60 with "נענו 0", having done the work twice.
 * Worse, it is the wrong order — the site asked to connect a Google account
 * before the visitor had seen a single price move. Keeping the answer turns
 * "sign up so you can play" into "sign in to keep what you already did", which
 * is the same click for a very different reason.
 *
 * sessionStorage rather than a cookie: the value is per-tab and dies with the
 * tab, so a second tab or another device cannot replay it, and it never rides
 * along on a request. It survives the round trip to Google, which is the only
 * navigation it has to live through.
 *
 * Exactly-once is the point — this becomes a binding trade. `takePendingAnswer`
 * deletes before it returns, so a refresh, a back button, or a second call in the
 * same tab all come back empty. Dependency-free leaf module: both the landing
 * page and the deck import it.
 */

export interface PendingAnswer {
  marketId: string;
  side: "YES" | "NO";
  stake: number;
  /** shown when the answer is redeemed, so the confirmation names the question */
  title: string;
  /** epoch ms; an answer older than `PENDING_ANSWER_TTL_MS` is not executed */
  at: number;
}

const KEY = "bhirot:pending-answer";

/**
 * An hour. Long enough for any real "read the page, sign in with Google" trip,
 * short enough that a tab left open overnight does not wake up and spend money
 * on a price that has moved since.
 */
export const PENDING_ANSWER_TTL_MS = 60 * 60 * 1000;

export function savePendingAnswer(a: Omit<PendingAnswer, "at">): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...a, at: Date.now() } satisfies PendingAnswer));
  } catch {
    // private mode, or storage full: the visitor still gets to log in, they just
    // answer again afterwards. Never block the trip for this.
  }
}

/** Reads and clears in one go — see the note on exactly-once above. */
export function takePendingAnswer(now = Date.now()): PendingAnswer | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as PendingAnswer;
    if (!a?.marketId || (a.side !== "YES" && a.side !== "NO") || !Number.isFinite(a.stake)) return null;
    if (!Number.isFinite(a.at) || now - a.at > PENDING_ANSWER_TTL_MS) return null;
    return a;
  } catch {
    return null;
  }
}

export function clearPendingAnswer(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
