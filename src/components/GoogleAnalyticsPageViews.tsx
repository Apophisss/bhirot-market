"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pageview } from "@/lib/gtag";

/**
 * Reports client-side navigations to GA. Without this the App Router would
 * only ever register the page a visitor landed on: everything after it is a
 * soft navigation that never reloads the document, so gtag.js sees nothing.
 */
export function GoogleAnalyticsPageViews() {
  const pathname = usePathname();
  // the query string matters: sorting, search and "show more" are all ?params
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const url = query ? `${pathname}?${query}` : pathname;

  // Seeded with the landing page, which the `config` command in
  // <GoogleAnalytics /> already reported — counting it here too would double every session's first
  // page. Comparing the URL rather than counting effect runs is deliberate:
  // React re-runs effects on mount in development, and a "skip the first run"
  // flag reports the landing page in dev but not in production.
  const reported = useRef(url);

  useEffect(() => {
    if (reported.current === url) return;
    reported.current = url;
    pageview(url);
  }, [url]);

  return null;
}
