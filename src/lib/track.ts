/**
 * Browser-side event queue for the site's own analytics.
 * Batches events and ships them with `sendBeacon`, so tracking never blocks a click
 * and never throws into the page. Server-side counterpart: `src/lib/analytics.ts`.
 *
 * Every event also goes to GA4 (`ga-bridge.ts`), so the two systems see the same
 * site instead of GA4 seeing whichever handful of interactions someone remembered
 * to wire up by hand.
 */

import { forwardToGa } from "./ga-bridge";

export interface TrackPayload {
  path?: string;
  query?: string;
  referrer?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  marketId?: string;
  value?: number;
  props?: Record<string, unknown>;
}

interface QueuedEvent extends TrackPayload {
  name: string;
  sessionId: string;
}

const ENDPOINT = "/api/analytics/collect";
const SESSION_KEY = "bm_sid";
const FLUSH_MS = 3000;
const MAX_BATCH = 30;

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let disabled = false;

/** Called once from <Analytics> when the site is running with tracking off. */
export function disableTracking() {
  disabled = true;
  queue = [];
}

/** One id per browser tab visit; lives in sessionStorage, never leaves the tab except as a random string. */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** True the first time this browser ever loads the site (localStorage flag). */
export function isFirstVisit(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem("bm_seen")) return false;
    localStorage.setItem("bm_seen", String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export function track(name: string, payload: TrackPayload = {}): void {
  if (typeof window === "undefined") return;
  // before the gate below on purpose: `disabled` turns off this site's own log,
  // and GA already ignores it — <GoogleAnalytics> loads gtag.js and reports page
  // views whatever this flag says. Events following the same rule is what keeps
  // GA coherent; the alternative is a GA property full of pages nobody interacted
  // with. GA's own off switch is a missing measurement ID.
  forwardToGa(name, payload);
  if (disabled) return;
  try {
    queue.push({
      name,
      sessionId: getSessionId(),
      path: payload.path ?? window.location.pathname,
      query: payload.query ?? window.location.search.replace(/^\?/, ""),
      ...payload,
    });
  } catch {
    return;
  }
  if (queue.length >= MAX_BATCH) flush();
  else if (timer == null) timer = setTimeout(flush, FLUSH_MS);
}

export function flush(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length || typeof window === "undefined") return;
  const batch = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ events: batch });
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) {
      if (queue.length) timer = setTimeout(flush, 100);
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => {});
  } catch {
    /* analytics must never break the page */
  }
}
