/**
 * Sharing one question, in numbers and strings.
 *
 * Dependency-free leaf module (like `referral.ts` and `social.ts`) so the button in
 * the browser and the middleware that reads the arriving link quote the same two
 * parameter names. The share is the most natural referral this product has — someone
 * arguing about a question sends it to the person they are arguing with — and until
 * these parameters existed it arrived as direct traffic and was invisible in the
 * funnel.
 */
import { SITE_NAME, SITE_URL } from "./config";

/**
 * The value of `?ref=` on a shared link.
 *
 * Deliberately `ref` and not `utm_source`: `readAdParams()` treats a `utm_source` as
 * a campaign click and stamps the 90-day paid-attribution cookie, so shares dressed
 * as UTMs would have booked every forwarded question as traffic we paid Google for.
 *
 * It is also deliberately a word, not a code. `?ref=<code>` credits a player's invite
 * link, and `normalizeReferralCode()` would happily accept "share" as one — so the
 * middleware has to be able to tell the sentinel from a real code, and it does that
 * by name. Nothing else may be added here without teaching the middleware about it.
 */
export const SHARE_REF = "share";

/** Which control the share came out of, carried in `?s=`. */
export type ShareSource = "native" | "copy" | "wa";

/** Name of the query parameter that carries the {@link ShareSource}. */
export const SHARE_SOURCE_PARAM = "s";

/**
 * The link that travels, always on the canonical site URL rather than on whatever
 * host the browser happens to be — the same rule as `inviteUrl()` and `leagueUrl()`:
 * a link shared from a preview deployment should still send people to the real site.
 */
export function shareUrl(path: string, source: ShareSource): string {
  const url = new URL(path, SITE_URL);
  url.searchParams.set("ref", SHARE_REF);
  url.searchParams.set(SHARE_SOURCE_PARAM, source);
  return url.toString();
}

/**
 * The message that goes out on WhatsApp — the link on its own line, so every client
 * links it. WhatsApp only draws a preview card for a URL it can find on a line of its
 * own; a link glued to the end of a sentence is sent as plain text, which is the
 * whole preview gone. Same rule as `inviteShareText()` and `leagueShareText()`.
 */
export function shareMessage(text: string | undefined, url: string): string {
  const line = (text ?? `שאלה ב${SITE_NAME}`).replace(/\s+/g, " ").trim();
  return `${line}\n${url}`;
}

/** `wa.me` share link. The whole message goes in `text` — there is no separate url field. */
export function whatsappHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
