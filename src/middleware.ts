import { NextResponse, type NextRequest } from "next/server";
import { CATEGORY_IDS } from "@/lib/categories";

/**
 * Category browsing used to live at /?category=<id> and now has its own page at
 * /category/<id>. The redirect belongs here rather than in the page: the home
 * route streams behind a loading skeleton, so a redirect thrown while rendering
 * would only ever reach the crawler as a <meta refresh> instead of a 308.
 */
export function middleware(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  if (!category) return NextResponse.next();

  // the target never carries ?category=, so this can never loop
  const url = req.nextUrl.clone();
  url.searchParams.delete("category");
  url.pathname = CATEGORY_IDS.includes(category) ? `/category/${category}` : "/";
  return NextResponse.redirect(url, 308);
}

export const config = { matcher: "/" };
