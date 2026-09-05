import Script from "next/script";
import { Suspense } from "react";
import { ADS_ID, GA_MEASUREMENT_ID, adsEnabled, gaEnabled } from "@/lib/gtag";
import { GoogleAnalyticsPageViews } from "./GoogleAnalyticsPageViews";

/**
 * Google Analytics 4 and Google Ads for the whole site — rendered once by the
 * root layout, so every route is covered and no page can forget it. The site's
 * own tracker (<Analytics />, backed by src/lib/analytics.ts) runs beside it
 * and is unrelated.
 *
 * Both products ride the same gtag.js, so the script is loaded once and each
 * configured ID gets its own `config` line. Either one alone is enough to load
 * it: a campaign can run before GA4 is set up, and usually does.
 *
 * Renders nothing at all when neither ID was set at build time, which is the
 * normal state in development and in CI.
 */
export function GoogleAnalytics() {
  if (!gaEnabled && !adsEnabled) return null;
  // whichever id loads the library; the config lines below are what actually enable each product
  const loader = gaEnabled ? GA_MEASUREMENT_ID : ADS_ID;
  return (
    <>
      {/* afterInteractive, not beforeInteractive: analytics must never sit in
          front of the first paint. */}
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loader)}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
// send_page_view stays on: this call reports the landing page, and
// GoogleAnalyticsPageViews reports every client-side navigation after it.
${gaEnabled ? `gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)});` : ""}
${adsEnabled ? `gtag('config', ${JSON.stringify(ADS_ID)});` : ""}`}
      </Script>
      {/* useSearchParams needs a boundary; a bare fallback is right here
          because the component renders nothing either way. */}
      {gaEnabled && (
        <Suspense fallback={null}>
          <GoogleAnalyticsPageViews />
        </Suspense>
      )}
    </>
  );
}
