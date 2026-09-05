import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0d2a6b",
    categories: ["news", "politics", "games"],
    /*
      Long-press shortcuts on an installed icon. They are also what Android's
      install prompt reads as evidence that this is an app and not a bookmark —
      alongside the service worker registered by <ServiceWorker />.

      The three destinations are the three things someone opens the app to do:
      answer the next questions, look at their positions, see where they stand.
    */
    shortcuts: [
      { name: "מצב זריז", short_name: "זריז", description: "לענות על שאלות ברצף", url: "/rapid" },
      { name: "הניקוד שלי", short_name: "ניקוד", description: "התשובות והרווח/הפסד שלי", url: "/portfolio" },
      { name: "לוח המובילים", short_name: "מובילים", description: "מי מוביל בניחושים", url: "/leaderboard" },
    ],
    // an installable manifest needs square 192 and 512 rasters; the 1200x630 share
    // picture that used to sit here is neither square nor an icon
    icons: [
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
