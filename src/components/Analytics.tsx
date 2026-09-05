import Script from "next/script";
import { Suspense } from "react";
import { GA_MEASUREMENT_ID, analyticsEnabled } from "@/lib/analytics";
import { AnalyticsPageViews } from "./AnalyticsPageViews";

/**
 * Google Analytics 4 for the whole site — rendered once by the root layout, so
 * every route is covered and no page can forget it.
 *
 * Renders nothing at all when NEXT_PUBLIC_GA_MEASUREMENT_ID was not set at
 * build time, which is the normal state in development and in CI.
 */
export function Analytics() {
  if (!analyticsEnabled) return null;
  const id = JSON.stringify(GA_MEASUREMENT_ID);
  return (
    <>
      {/* afterInteractive, not beforeInteractive: analytics must never sit in
          front of the first paint. */}
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
// send_page_view stays on: this call reports the landing page, and
// AnalyticsPageViews reports every client-side navigation after it.
gtag('config', ${id});`}
      </Script>
      {/* useSearchParams needs a boundary; a bare fallback is right here
          because the component renders nothing either way. */}
      <Suspense fallback={null}>
        <AnalyticsPageViews />
      </Suspense>
    </>
  );
}
