import { NextResponse, type NextRequest } from "next/server";
import { CATEGORY_IDS } from "@/lib/categories";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, normalizeReferralCode } from "@/lib/referral";
import { AD_COOKIE, AD_COOKIE_MAX_AGE, AD_LANDING_COOKIE, readAdParams, serializeAdAttribution } from "@/lib/ad-attribution";

/**
 * An invite link (`/i/<code>`) has to leave something behind: the visitor lands, reads the
 * offer, browses, and only signs up later — possibly after a round trip to Google. The
 * cookie stamped here is what `claimPendingReferral()` reads when the account is finally
 * created. It is set in middleware rather than in the page because a Server Component
 * cannot write cookies, and a Route Handler would give the shared link no preview card.
 */
function stampInvite(req: NextRequest) {
  const res = NextResponse.next();
  const code = normalizeReferralCode(req.nextUrl.pathname.slice("/i/".length));
  if (code) {
    res.cookies.set(REFERRAL_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}

/**
 * Category browsing used to live at /?category=<id> and now has its own page at
 * /category/<id>. The redirect belongs here rather than in the page: the home
 * route streams behind a loading skeleton, so a redirect thrown while rendering
 * would only ever reach the crawler as a <meta refresh> instead of a 308.
 */
function categoryRedirect(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  if (!category) return NextResponse.next();

  // the target never carries ?category=, so this can never loop
  const url = req.nextUrl.clone();
  url.searchParams.delete("category");
  url.pathname = CATEGORY_IDS.includes(category) ? `/category/${category}` : "/";
  return NextResponse.redirect(url, 308);
}

/**
 * An ad click leaves the same kind of trace an invite link does: someone lands
 * from a campaign, browses, and signs up later — possibly after a round trip to
 * Google. `claimAdAttribution()` reads this cookie when the account is finally
 * created. Stamped here rather than in the browser so an ad-blocker cannot hide
 * it, and set only on the first campaign visit — overwriting would credit the
 * last click instead of the one that actually earned the account.
 *
 * The second cookie is the opposite: it is about the visit rather than the
 * account, so it is rewritten on every paid landing and dies with the browser
 * session. See `AD_LANDING_COOKIE`.
 */
function stampAdClick(req: NextRequest, res: NextResponse): NextResponse {
  const attr = readAdParams(req.nextUrl.searchParams);
  if (!attr) return res;
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
  // "this visit came from an ad", refreshed on every paid landing and gone when the
  // browser closes: it decides what the next few screens look like, not who gets credit
  res.cookies.set(AD_LANDING_COOKIE, "1", base);
  if (req.cookies.has(AD_COOKIE)) return res;
  res.cookies.set(AD_COOKIE, serializeAdAttribution(attr), { ...base, maxAge: AD_COOKIE_MAX_AGE });
  return res;
}

export function middleware(req: NextRequest) {
  const res = req.nextUrl.pathname.startsWith("/i/") ? stampInvite(req) : categoryRedirect(req);
  // a redirect drops the query, so the click has to be recorded before it leaves
  return stampAdClick(req, res);
}

// /welcome is the ad landing page; it is in the matcher so the click is stamped there too
export const config = { matcher: ["/", "/i/:code", "/welcome"] };
