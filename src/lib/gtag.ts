/**
 * Google Analytics 4 (gtag.js). Loaded once for the whole site by
 * <GoogleAnalytics /> in the root layout, so every page is measured without
 * any page having to opt in.
 *
 * Separate from `src/lib/analytics.ts`, which is the site's own event log:
 * that one is first-party and feeds /admin, this one reports to Google. They
 * measure the same site and neither depends on the other.
 *
 * The measurement ID arrives as NEXT_PUBLIC_GA_MEASUREMENT_ID, which Next
 * inlines at build time: a value that is only in the server's environment
 * ships a bundle with analytics switched off. When it is missing — local
 * development, CI, a preview build — every function here is a no-op and no
 * script is loaded at all.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Measurement ID of the GA4 data stream (`G-XXXXXXXXXX`). */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

/** GA only runs when a real GA4 ID was compiled in. */
export const gaEnabled = /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID);

/**
 * The queue gtag.js drains once it loads. Created here as well as in the
 * inline snippet because a React effect can fire before an afterInteractive
 * script has run — pushing into `window.dataLayer` early is how the official
 * snippet avoids losing those events.
 *
 * `arguments`, not a rest array: that is the shape gtag.js reads commands in.
 */
function gtag(...args: unknown[]): void {
  const layer = (window.dataLayer ??= []);
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params -- an array is not the same shape: gtag.js drains the queue expecting `arguments` objects
      layer.push(arguments);
    };
  }
  window.gtag(...args);
}

/**
 * A client-side navigation. The `config` command reports the first page on its
 * own, so this is only ever called for the ones after it (see
 * GoogleAnalyticsPageViews) — calling it on load too would double-count the
 * landing page.
 */
export function pageview(path: string): void {
  if (!gaEnabled || typeof window === "undefined") return;
  gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    // an empty title happens mid-transition (a sign-in redirect, say); sending
    // it would overwrite a real one with nothing, so leave the key out instead
    ...(document.title ? { page_title: document.title } : {}),
  });
}

export type GaParams = Record<string, string | number | boolean | undefined>;

/**
 * A named interaction. Deliberately never given `value`/`currency`: the money
 * here is virtual, and those two parameters would land it in GA's revenue
 * reports as if it were not.
 */
export function gaEvent(name: string, params: GaParams = {}): void {
  if (!gaEnabled || typeof window === "undefined") return;
  gtag("event", name, params);
}
