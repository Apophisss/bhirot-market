import { NextResponse, type NextRequest } from "next/server";
import { CATEGORY_IDS } from "@/lib/categories";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, normalizeReferralCode } from "@/lib/referral";

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

export function middleware(req: NextRequest) {
  return req.nextUrl.pathname.startsWith("/i/") ? stampInvite(req) : categoryRedirect(req);
}

export const config = { matcher: ["/", "/i/:code"] };
