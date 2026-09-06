import { NextResponse, type NextRequest } from "next/server";
import { CATEGORY_IDS } from "@/lib/categories";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, normalizeReferralCode } from "@/lib/referral";
import { SHARE_REF } from "@/lib/share";
import { AD_COOKIE, AD_COOKIE_MAX_AGE, AD_LANDING_COOKIE, readAdParams, serializeAdAttribution } from "@/lib/ad-attribution";

/**
 * A referral has to leave something behind: the visitor lands, reads the offer,
 * browses, and only signs up later — possibly after a round trip to Google. The cookie
 * stamped here is what `claimPendingReferral()` reads when the account is finally
 * created. It is set in middleware rather than in the page because a Server Component
 * cannot write cookies, and a Route Handler would give the shared link no preview card.
 *
 * The code arrives one of two ways. An invite link carries it in the path (`/i/<code>`),
 * which is all this used to handle; everywhere else it arrives as `?ref=<code>` — on a
 * league invite, on a link someone pasted into a group, on any page at all. A code that
 * only works on one route is a code that gets lost the moment anyone edits the link.
 */
function stampReferral(req: NextRequest, res: NextResponse): NextResponse {
  const { pathname, searchParams } = req.nextUrl;
  const raw = pathname.startsWith("/i/") ? pathname.slice("/i/".length) : searchParams.get("ref");
  /*
    `?ref=share` says "this link came out of the share button", not "credit this
    player" — and `normalizeReferralCode()` would happily accept the word "share" as a
    code and stamp a five-letter referral that belongs to nobody. The sentinel is
    checked by name before anything else looks at the value.
  */
  if (raw === SHARE_REF) return res;
  const code = normalizeReferralCode(raw);
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
 *
 * The home page only, and the check is on the path rather than on the matcher, which
 * now covers the whole site: `?category=` is a *filter the home page no longer has*,
 * and it is a perfectly ordinary parameter elsewhere. /rapid?category=<id> is the deck
 * filtered to a category — the link behind "ענו ברצף" on every board — and while this
 * ran on it, that link 308'd straight back to the grid the visitor was trying to leave.
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
  const res = req.nextUrl.pathname === "/" ? categoryRedirect(req) : NextResponse.next();
  // a redirect drops the query, so the click has to be recorded before it leaves
  return stampAdClick(req, stampReferral(req, res));
}

/*
  Every page on the site, because a link that carries who sent it can land anywhere.
  The matcher used to name four routes — "/", "/i/<code>", "/welcome" and "/rapid" —
  which meant a shared question, a league invite (/l/<code>) or an ad whose final URL
  was a question page all arrived with nothing recorded. Both cookies are about where
  the *visitor* came from, so the only paths worth excluding are the ones no visitor
  ever lands on: /api/ (fetched by our own pages), Next's build output, and anything
  with a file extension, which is a static asset — robots.txt, sitemap.xml, og.png.
*/
export const config = {
  matcher: ["/((?!api/|_next/|.*\\.[^/]*$).*)"],
};
