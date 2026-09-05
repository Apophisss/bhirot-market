import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
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
