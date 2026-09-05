"use client";

import { useEffect } from "react";

/**
 * Registers `/public/sw.js`.
 *
 * The manifest was already valid and complete — icons, `display: standalone`, a
 * theme colour — and the site still had zero registered service workers, which is
 * why nothing ever offered to install it: Chrome on Android requires a worker with
 * a fetch handler before it will treat a site as installable at all.
 *
 * Registration waits for `load` on purpose. Doing it during hydration puts the
 * worker's own install (and the shell fetches it makes) in front of the page's
 * remaining work on a phone's single thread.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // an unsupported browser, a private window, or a blocked registration:
        // the site works exactly as it did before, just without offline support
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
