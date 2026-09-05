/*
  Service worker for בחירות מרקט.
  ------------------------------------------------------------------------------
  Deliberately small. The site is a live market: prices, positions and balances
  change by the second, so almost nothing here may be served from a cache. What a
  service worker does buy us is the two things the site had no answer for at all:

    1. installability — Chrome on Android only offers "add to home screen" for a
       site that controls its own fetches;
    2. a real page instead of the browser's dinosaur when the train goes into a
       tunnel mid-scroll.

  So: static assets (the icons, the logo, the offline page) are cached and served
  cache-first, because they are versioned by URL and never change under a URL.
  Everything else — every navigation, every API call — goes to the network, and
  only a *navigation* that fails falls back to the offline page. A stale price is
  worse than no price, so nothing dynamic is ever stored.
*/

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;

/** Versioned by URL and safe to keep: nothing here changes without its name changing. */
const SHELL_ASSETS = ["/offline.html", "/logo.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // one missing asset must not fail the whole install
      await Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // another origin's response is that origin's business
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match("/offline.html")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        return cached ?? fetch(request);
      })(),
    );
  }
  // everything else: no handler at all, which is the browser's own default path
});
