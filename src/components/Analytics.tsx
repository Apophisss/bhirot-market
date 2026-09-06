"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { EVENTS } from "@/lib/events";
import { disableTracking, flush, isFirstVisit, track } from "@/lib/track";

/**
 * React reports the same vital more than once (Strict Mode in dev, several roots),
 * so keep the "already sent" set on `window` — it is the one thing that is a singleton
 * no matter how many times the module is evaluated.
 */
function alreadySent(key: string): boolean {
  const w = window as unknown as { __bmVitals?: Set<string> };
  const seen = (w.__bmVitals ??= new Set<string>());
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

/** Stable reference, as `useReportWebVitals` requires. */
function reportVital(metric: { name: string; value: number; rating?: string; id: string }) {
  // ms for LCP/FCP/TTFB/INP, unitless for CLS
  const value = Math.round(metric.value * 1000) / 1000;
  if (typeof window === "undefined" || alreadySent(`${metric.name}:${value}`)) return;
  track(EVENTS.webVital, { value, props: { metric: metric.name, rating: metric.rating ?? "" } });
}

/** A remount (React Strict Mode in dev, a re-render on the same URL) must not count twice. */
const lastView = { key: "", at: 0 };

/** "he-IL" → "he", "en-US" → "en": the language alone is the signal, the region is noise. */
function browserLang(): string {
  try {
    return (navigator.language || "").slice(0, 2).toLowerCase();
  } catch {
    return "";
  }
}

/** Facebook/Instagram/Gmail-style embedded browsers, and Android's bare WebView marker. */
function inAppBrowser(): boolean {
  try {
    return /\bwv\b|FBAN|FBAV|Instagram|GSA\/|Line\/|; wv\)/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

function referrerHost(): string {
  try {
    if (!document.referrer) return "";
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return host === window.location.hostname.replace(/^www\./, "") ? "internal" : host;
  } catch {
    return "";
  }
}

/**
 * Site-wide tracking: a pageview per navigation, time-on-page and scroll depth on exit,
 * clicks on anything carrying `data-evt`, outbound links and Core Web Vitals.
 * Rendered once from the root layout, inside a Suspense boundary (it reads search params).
 */
export function Analytics({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const startedAt = useRef(0);
  const maxScroll = useRef(0);
  const exited = useRef(false);

  useReportWebVitals(reportVital);

  useEffect(() => {
    if (!enabled) disableTracking();
  }, [enabled]);

  // pageview + page_exit (time on page, scroll depth)
  useEffect(() => {
    if (!enabled) return;
    const path = pathname || "/";
    const sp = new URLSearchParams(query);
    const key = `${path}?${query}`;
    const now = Date.now();
    const repeat = lastView.key === key && now - lastView.at < 1500;
    lastView.key = key;
    lastView.at = now;
    startedAt.current = now;
    maxScroll.current = 0;
    exited.current = false;

    if (!repeat) {
      // Google's auto-tagging can send a click with a gclid and no utm_* at all; an
      // ad click without a medium would vanish from the paid funnel while the account
      // it produces still carries the gclid. Same rule as the attribution cookie.
      const clicked = sp.get("gclid") || sp.get("gbraid") || sp.get("wbraid");
      track(EVENTS.pageview, {
        path,
        query,
        referrer: referrerHost(),
        source: sp.get("utm_source") || (clicked ? "google" : ""),
        medium: sp.get("utm_medium") || (clicked ? "cpc" : ""),
        campaign: sp.get("utm_campaign") ?? "",
        props: {
          title: document.title.slice(0, 120),
          width: window.innerWidth,
          first: isFirstVisit() ? 1 : 0,
          // The browser's language, as the closest thing to a country this stack has:
          // the server sits behind Caddy with no geo header, so every visitor is "??".
          // A campaign aimed at Israel that brings mostly non-Hebrew browsers is a
          // targeting problem, and this is the one field that shows it.
          lang: browserLang(),
          // the ad group (Google substitutes {adgroupid} into utm_content), so two
          // audiences can be told apart without joining on the account row
          content: (sp.get("utm_content") ?? "").slice(0, 60),
          // an embedded in-app browser: Google sign-in refuses some of them outright,
          // and Demand Gen serves inside exactly those apps
          webview: inAppBrowser() ? 1 : 0,
        },
      });
      const q = sp.get("q")?.trim();
      if (q) track(EVENTS.search, { path, query, props: { q: q.slice(0, 60) } });
    }

    const onScroll = () => {
      const el = document.documentElement;
      const scrollable = el.scrollHeight - el.clientHeight;
      const depth = scrollable > 0 ? Math.min(1, (window.scrollY || el.scrollTop) / scrollable) : 1;
      if (depth > maxScroll.current) maxScroll.current = depth;
    };
    const exit = () => {
      if (exited.current) return;
      exited.current = true;
      const spent = Date.now() - startedAt.current;
      // anything under a quarter second is a remount, not a visit
      if (spent >= 250) {
        track(EVENTS.pageExit, {
          path,
          query,
          value: spent,
          props: { scroll: Math.round(maxScroll.current * 100) / 100 },
        });
      }
      flush();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") exit();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", exit);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", exit);
      document.removeEventListener("visibilitychange", onHide);
      exit();
    };
  }, [pathname, query, enabled]);

  // delegated clicks: anything with data-evt, plus every outbound link
  useEffect(() => {
    if (!enabled) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest) return;
      const marked = target.closest<HTMLElement>("[data-evt]");
      if (marked) {
        track(EVENTS.click, {
          marketId: marked.dataset.evtMarket || undefined,
          props: {
            id: marked.dataset.evt,
            label: (marked.dataset.evtLabel ?? marked.textContent ?? "").trim().slice(0, 60),
          },
        });
      }
      const link = target.closest<HTMLAnchorElement>("a[href]");
      const href = link?.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) {
        try {
          const host = new URL(href).hostname;
          if (host !== window.location.hostname) {
            track(EVENTS.outbound, { props: { host, href: href.slice(0, 200) } });
          }
        } catch {
          /* ignore malformed hrefs */
        }
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [enabled]);

  return null;
}
