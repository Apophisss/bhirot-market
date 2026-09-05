/**
 * Mirrors the site's own events into GA4.
 *
 * The site has always measured broadly — page views, marked clicks, search,
 * shares, outbound links, time on page, trades, web vitals, browser errors —
 * but all of it went to one place: the first-party log behind `/admin`. GA4 was
 * told about five interactions, each by a hand-written `gaEvent()` call at the
 * site of the action, which meant GA4's picture of the site was whatever anyone
 * had remembered to wire up.
 *
 * Forwarding centrally is what fixes that for good: every event the site
 * already records reaches GA4 too, and a new event added anywhere is measured
 * in both places without its author having to know GA4 exists.
 *
 * The two systems stay independent, exactly as before — this is a fan-out, not
 * a dependency. `gaEvent()` is a no-op without a measurement ID, so nothing
 * here does anything in development or CI.
 */

import { gaEvent, type GaParams } from "./gtag";

/** The shape `track()` passes on. Declared structurally so this stays a leaf. */
interface ForwardedPayload {
  marketId?: string;
  value?: number;
  props?: Record<string, unknown>;
}

/**
 * GA4 reports the page itself: the `config` command sends the landing page and
 * `<GoogleAnalyticsPageViews>` sends every navigation after it. Forwarding the
 * first-party `pageview` on top of that would double every number in GA's most
 * used report.
 */
const SKIP = new Set(["pageview"]);

/**
 * Where each event's `value` belongs.
 *
 * `value` is never forwarded under that name: in GA4 it is the revenue
 * parameter, and the money on this site is virtual (see `gaEvent`). Naming it
 * per event also keeps the reports readable — "seconds" and "amount" are
 * different questions, and a single `value` column cannot answer either.
 */
const VALUE_PARAM: Record<string, string> = {
  page_exit: "seconds",
  web_vital: "metric_value",
};

/** GA4 limits: ≤40 chars for a parameter name, ≤100 for a value, ≤25 params per event. */
const NAME_MAX = 40;
const VALUE_MAX = 100;
const PARAM_MAX = 25;

/** `loggedIn` → `logged_in`: GA4 reports read as snake_case, and the props do not. */
function snake(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, NAME_MAX);
}

/** GA4 takes flat scalars; anything else is dropped rather than stringified into noise. */
function scalar(v: unknown): string | number | boolean | undefined {
  if (typeof v === "string") return v.slice(0, VALUE_MAX) || undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v;
  return undefined;
}

/** Sends one first-party event to GA4 under the same name, with GA4-shaped parameters. */
export function forwardToGa(name: string, payload: ForwardedPayload = {}): void {
  if (SKIP.has(name)) return;

  const params: GaParams = {};
  if (payload.marketId) params.market_id = String(payload.marketId).slice(0, VALUE_MAX);

  if (typeof payload.value === "number" && Number.isFinite(payload.value)) {
    const key = VALUE_PARAM[name] ?? "amount";
    // the page timer counts milliseconds, which is not a unit anyone reads a report in
    params[key] = key === "seconds" ? Math.round(payload.value / 1000) : payload.value;
  }

  for (const [key, raw] of Object.entries(payload.props ?? {})) {
    if (Object.keys(params).length >= PARAM_MAX) break;
    const v = scalar(raw);
    if (v === undefined) continue;
    // `search` is one of GA4's own recommended events, and it reports the term
    // under `search_term` — the built-in search reports read that key and no other
    params[name === "search" && key === "q" ? "search_term" : snake(key)] = v;
  }

  gaEvent(name, params);
}
