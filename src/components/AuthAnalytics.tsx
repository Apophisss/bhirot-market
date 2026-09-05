"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { gaEvent } from "@/lib/gtag";
import { AUTH_SIGNAL_COOKIE, parseAuthSignal } from "@/lib/auth-signal";

/**
 * Reports GA4's `login` and `sign_up` on the first page after a sign-in.
 *
 * Firing them on the login screen instead would report neither: the click on
 * "המשך עם Google" leaves the document for accounts.google.com immediately, and
 * an event queued a moment before the browser tears the page down is lost — the
 * more so here, where gtag.js is `lazyOnload` and may not have loaded yet. And
 * at that point nothing on the page knows yet whether the sign-in will succeed,
 * or whether it will create an account or resume one.
 *
 * So the server states what happened (`auth.events.signIn` → AUTH_SIGNAL_COOKIE)
 * and this reads it on the page it lands on, where gtag.js has a whole page life
 * to load. The cookie is deleted before the event is sent, so a refresh or a
 * second tab cannot report the same sign-in twice.
 *
 * Keyed on the path and not on mount alone. Coming back from Google is a fresh
 * document and either would do, but the development login is a server action:
 * the cookie arrives on its response and the move to the next page is a soft
 * navigation, which never remounts anything in the root layout. A mount-only
 * effect reported that sign-in on the *next* full page load, or never.
 */
export function AuthAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    let raw: string | undefined;
    try {
      raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${AUTH_SIGNAL_COOKIE}=`))
        ?.slice(AUTH_SIGNAL_COOKIE.length + 1);
    } catch {
      // measurement must never break the page
    }
    if (!raw) return;

    // consume it first: deleting only after a successful send would re-report the
    // sign-in on every render until something finally worked
    document.cookie = `${AUTH_SIGNAL_COOKIE}=; Max-Age=0; path=/`;

    const signal = parseAuthSignal(decodeURIComponent(raw));
    if (signal) gaEvent(signal.event, { method: signal.method });
  }, [pathname]);

  return null;
}
