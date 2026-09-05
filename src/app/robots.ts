import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // private or machine-only routes; filtered listings are handled with noindex + canonical
        disallow: ["/api/", "/admin", "/portfolio", "/for-you", "/login"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: new URL(SITE_URL).host,
  };
}
