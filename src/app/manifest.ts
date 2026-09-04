import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/config";

/** Lets the site be added to a phone's home screen and open without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: "שוק חיזויים בכסף וירטואלי על הבחירות לכנסת ה־26. השאלות מתעדכנות כל שעה על ידי צוות המערכת.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "he",
    dir: "rtl",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["news", "politics", "games"],
    icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
