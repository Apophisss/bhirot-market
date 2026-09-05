"use client";

import Script from "next/script";
import { useCallback, useEffect } from "react";
import {
  ADS_ID,
  ATTR_COOKIE,
  ATTR_MAX_AGE,
  GA_ID,
  adsSendTo,
  analyticsEnabled,
  readAttribution,
  serializeAttribution,
  type Conversion,
} from "@/lib/analytics";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Any client code can ask for a conversion re-check after an action that might have produced one. */
export const CONVERSION_CHECK_EVENT = "bm:conversion-check";

/** Marker appended to the post-login redirect, so the return trip always re-checks. */
export const CHECK_PARAM = "_c";
const SESSION_FLAG = "bm_conv_checked";
/** Rapid mode fires an answer every couple of seconds; one check per window is plenty. */
const CHECK_THROTTLE_MS = 10_000;

let lastCheck = 0;

export function checkConversions() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastCheck < CHECK_THROTTLE_MS) return;
  lastCheck = now;
  window.dispatchEvent(new Event(CONVERSION_CHECK_EVENT));
}

function fire({ name, value }: Conversion) {
  if (typeof window.gtag !== "function") return;
  // GA4 gets the plain event (readable in reports, importable into Ads);
  // Ads gets a second, labelled hit only when a conversion action is configured.
  window.gtag("event", name, { value, currency: "ILS" });
  const sendTo = adsSendTo(name);
  if (sendTo) window.gtag("event", "conversion", { send_to: sendTo, value, currency: "ILS" });
}

/**
 * Loads gtag, remembers which ad click brought a visitor, and reports the two
 * conversions Demand Gen bids on.
 *
 * The server decides *whether* a conversion is owed (see /api/conversions) so a
 * refresh cannot report the same signup twice; this component only delivers it.
 */
export function Analytics() {
  const check = useCallback(async () => {
    if (!analyticsEnabled) return;
    try {
      const res = await fetch("/api/conversions", { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { events?: Conversion[] };
      for (const e of data.events ?? []) fire(e);
    } catch {
      // measurement must never break the page
    }
  }, []);

  useEffect(() => {
    // Store campaign params before anything can strip them from the URL. This runs
    // even with no tag configured: attribution is also how we read the numbers later.
    const attr = readAttribution(window.location.search);
    if (attr) {
      document.cookie = `${ATTR_COOKIE}=${encodeURIComponent(serializeAttribution(attr))}; path=/; max-age=${ATTR_MAX_AGE}; SameSite=Lax`;
    }
    // One check per tab, plus a guaranteed one on the way back from the login
    // redirect — otherwise every page view of every logged-out visitor would
    // post to an endpoint that has nothing to tell it.
    let due = new URLSearchParams(window.location.search).has(CHECK_PARAM);
    try {
      if (!sessionStorage.getItem(SESSION_FLAG)) {
        due = true;
        sessionStorage.setItem(SESSION_FLAG, "1");
      }
    } catch {
      due = true; // storage blocked (private mode): fall back to checking
    }
    if (due) {
      lastCheck = Date.now();
      void check();
    }
    window.addEventListener(CONVERSION_CHECK_EVENT, check);
    return () => window.removeEventListener(CONVERSION_CHECK_EVENT, check);
  }, [check]);

  if (!analyticsEnabled) return null;
  const primary = GA_ID || ADS_ID;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${primary}`} strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());
${GA_ID ? `gtag('config','${GA_ID}');` : ""}${ADS_ID ? `gtag('config','${ADS_ID}');` : ""}`}
      </Script>
    </>
  );
}
