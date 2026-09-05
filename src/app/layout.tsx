import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Analytics } from "@/components/Analytics";
import { JsonLd } from "@/components/JsonLd";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { AdConversions } from "@/components/AdConversions";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TAGLINE, SITE_TEAM, SITE_URL } from "@/lib/config";
import { siteGraph } from "@/lib/seo";

// the site uses regular / medium / bold / extrabold and nothing else; pinning the
// weights lets next/font subset the file instead of shipping the whole axis
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: `${SITE_TEAM}, ${SITE_NAME}`, url: `${SITE_URL}/about` }],
  creator: SITE_TEAM,
  publisher: SITE_NAME,
  category: "politics",
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false, email: false, address: false },
  // canonicals are set per page — a canonical here would be inherited by every route
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    siteName: SITE_NAME,
    locale: "he_IL",
    type: "website",
    url: "/",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${SITE_NAME} — ${SITE_TAGLINE}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  // app/favicon.ico is linked on its own, so it is not repeated here; the SVG is for
  // browsers that prefer it, and apple-touch-icon is the one iOS actually uses
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // draw under the notch/home indicator; the safe-area utilities keep content clear
  viewportFit: "cover",
  // the browser chrome follows the theme: the deep brand blue on a light page, the
  // page's own near-black in dark mode, where a bright band above the content is
  // exactly what a reader on dark mode is trying to avoid
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d2a6b" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      {/* lg:pb-0 drops the room the tab bar reserves once the header nav takes over */}
      <body className="flex min-h-dvh flex-col lg:pb-0">
        <JsonLd data={siteGraph()} />
        {/* the tracker reads search params, so it lives inside its own Suspense boundary */}
        <Suspense fallback={null}>
          <Analytics enabled={process.env.ANALYTICS_DISABLED !== "true"} />
        </Suspense>
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-10 pt-3 sm:px-6 sm:pb-16 sm:pt-4">{children}</main>
        <Footer />
        <GoogleAnalytics />
        <AdConversions />
        <ServiceWorker />
      </body>
    </html>
  );
}
