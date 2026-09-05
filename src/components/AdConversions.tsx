"use client";

import { useCallback, useEffect } from "react";
import { adsConversion, adsEnabled } from "@/lib/gtag";
import { AD_CHECK_PARAM } from "@/lib/ad-attribution";

/** Any client code can ask for a re-check after an action that might have produced a conversion. */
export const AD_CONVERSION_EVENT = "bm:ad-conversion";
// declared in a plain module so the server can read it too; re-exported here
// because the browser-side code has always imported it from this file
export { AD_CHECK_PARAM } from "@/lib/ad-attribution";

const SESSION_FLAG = "bm_ads_checked";
/** Rapid mode lands an answer every couple of seconds; one check per window is plenty. */
const THROTTLE_MS = 10_000;

let lastCheck = 0;

export function checkAdConversions() {
  if (typeof window === "undefined" || !adsEnabled) return;
  const now = Date.now();
  if (now - lastCheck < THROTTLE_MS) return;
  lastCheck = now;
  window.dispatchEvent(new Event(AD_CONVERSION_EVENT));
}

/**
 * Delivers the Google Ads conversions the server says are owed.
 *
 * The browser never decides *whether* a conversion happened — `/api/conversions`
 * does, and marks it claimed in the same statement, so a refresh or a second tab
 * cannot report one signup twice. This component only asks and fires.
 */
export function AdConversions() {
  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/conversions", { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { events?: { name: string; value: number }[] };
      for (const e of data.events ?? []) adsConversion(e.name, e.value);
    } catch {
      // measurement must never break the page
    }
  }, []);

  useEffect(() => {
    if (!adsEnabled) return;
    // One check per tab, plus a guaranteed one on the way back from the login
    // redirect. Otherwise every page view by every logged-out visitor would post
    // to an endpoint that has nothing to tell it.
    let due = new URLSearchParams(window.location.search).has(AD_CHECK_PARAM);
    try {
      if (!sessionStorage.getItem(SESSION_FLAG)) {
        due = true;
        sessionStorage.setItem(SESSION_FLAG, "1");
      }
    } catch {
      due = true; // storage blocked (private mode): check rather than skip
    }
    if (due) {
      lastCheck = Date.now();
      void check();
    }
    window.addEventListener(AD_CONVERSION_EVENT, check);
    return () => window.removeEventListener(AD_CONVERSION_EVENT, check);
  }, [check]);

  return null;
}
