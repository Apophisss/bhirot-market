import { AD_CHECK_PARAM } from "./ad-attribution";

/**
 * Where a sign-in lands, and why the two places that start one agree on it.
 *
 * Organic visitors land on the short preferences survey first; it forwards to
 * `callbackUrl` at once for anyone who already answered it. Paid traffic skips the
 * survey: someone who clicked an ad thirty seconds ago has no reason to spend a
 * screen on preferences before seeing that the product works at all, and the deck
 * offers the same survey on arrival. Either way the destination carries the
 * ad-check marker, so the trip back from Google re-checks for conversions.
 *
 * Shared by the sign-in page and the deck's own Google button (`login/actions.ts`),
 * so a visitor who signs in from the deck ends up exactly where one who went
 * through /login would.
 */
export function afterLoginPath(callbackUrl: string | undefined | null, fromAd: boolean): string {
  const redirectTo = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/rapid";
  const dest = fromAd || redirectTo.startsWith("/onboarding") ? redirectTo : `/onboarding?next=${encodeURIComponent(redirectTo)}`;
  return `${dest}${dest.includes("?") ? "&" : "?"}${AD_CHECK_PARAM}=1`;
}
