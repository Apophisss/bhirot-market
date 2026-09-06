import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // /llms.txt hands language-model agents the whole board and then points them at
        // /api/markets for the same thing in JSON. A blanket Disallow: /api/ made that
        // an invitation into a door we had locked: an agent that honours robots.txt —
        // which is exactly the well-behaved kind we published the file for — read the
        // offer and could not take it. The two paths llms.txt advertises are opened by
        // name; everything else under /api/ stays closed, and Google resolves the pair
        // by longest match, so the Allow wins for /api/markets alone.
        allow: ["/", "/api/markets"],
        // private or machine-only routes; filtered listings are handled with noindex + canonical
        // /friends, /leagues and the league invite landing (/l/<code>, one page per
        // code) are private by nature: a league table is a name-carrying board between
        // people who chose to be in it, and it has no business in a search index
        disallow: ["/api/", "/portfolio", "/login", "/admin", "/onboarding", "/friends", "/leagues", "/l/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: new URL(SITE_URL).host,
  };
}
