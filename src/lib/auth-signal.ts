/**
 * The hand-off that lets GA4 hear about a sign-in.
 *
 * GA4's two auth events, `login` and `sign_up`, have to be sent by gtag.js in
 * the browser — but only the server knows which of the two just happened: the
 * difference between a new account and a returning one is `isNewUser` inside
 * `auth.events.signIn`, and nothing about the page the visitor lands on
 * afterwards reveals it. The browser guessing from "am I logged in now?" would
 * report a `login` on every refresh and a `sign_up` never.
 *
 * So the sign-in response leaves a crumb and the next page reads it: the same
 * shape as the ad-attribution cookie, one step shorter. Deliberately NOT
 * httpOnly — `<AuthAnalytics>` reads it in the browser and deletes it in the
 * same breath, which is what makes each sign-in report exactly once.
 *
 * Unlike the Google Ads conversion (`ad-conversions.ts`), this is not a
 * once-per-account ledger: GA4 expects `login` on every sign-in, and the row in
 * the database says nothing about the current one.
 *
 * Dependency-free leaf module — the value is written on the server and parsed
 * in a `"use client"` component, so it can import neither side's code.
 */

/** Carries "a sign-in just happened, and it was this kind" to the next page load. */
export const AUTH_SIGNAL_COOKIE = "bm_auth";

/**
 * Long enough to survive the redirect chain back from Google (and a slow first
 * render on a phone), short enough that a visitor whose JavaScript never ran
 * does not report a stale sign-in on a visit an hour later.
 */
export const AUTH_SIGNAL_MAX_AGE = 5 * 60;

/** The two GA4 auth events, spelled the way GA4 names them. */
export type AuthSignalEvent = "sign_up" | "login";

export interface AuthSignal {
  event: AuthSignalEvent;
  /** The provider that authenticated, reported as GA4's `method` parameter. */
  method: string;
}

const EVENTS: readonly string[] = ["sign_up", "login"];

/** Provider ids are short slugs; anything else is not one, and must not reach a Set-Cookie header. */
const METHOD = /^[a-z0-9_-]{1,32}$/i;

/**
 * `~` and not `:`: cookie values are percent-encoded on the way out (and
 * decoded, or not, by whoever reads them), and `~` is one of the characters
 * `encodeURIComponent` leaves alone — so the string the browser reads back is
 * byte for byte the one the server wrote, whatever the layers in between do.
 */
const SEP = "~";

/**
 * Serialises the signal for the cookie. Returns null when the method is not a
 * plain provider slug, so a value that could break the header — or arrive in a
 * GA report as junk — is never written.
 */
export function serializeAuthSignal(signal: AuthSignal): string | null {
  if (!EVENTS.includes(signal.event) || !METHOD.test(signal.method)) return null;
  return `${signal.event}${SEP}${signal.method}`;
}

/** Reads the cookie back. Null for anything that is not a signal this module wrote. */
export function parseAuthSignal(value: string | undefined | null): AuthSignal | null {
  if (!value) return null;
  const parts = value.split(SEP);
  // exactly two: a third segment means this is not a value this module wrote
  if (parts.length !== 2) return null;
  const [event, method] = parts;
  if (!EVENTS.includes(event) || !METHOD.test(method)) return null;
  return { event: event as AuthSignalEvent, method };
}
