import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/config";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description:
    "שוק חיזויים בכסף וירטואלי על בחירות 2026 לכנסת: סקרים, קואליציה, משפט נתניהו, חוק הגיוס ועוד. השאלות מתעדכנות כל שעה על ידי צוות המערכת.",
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    locale: "he_IL",
    type: "website",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE_TAGLINE }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
  // the site is full of numbers and dates; Safari otherwise turns them into phone links
  formatDetection: { telephone: false, date: false, address: false },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // draw under the notch/home indicator; the safe-area utilities keep content clear
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      {/* pb-nav keeps the page clear of the fixed mobile tab bar */}
      <body className="pb-nav flex min-h-dvh flex-col lg:pb-0">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-10 pt-3 sm:px-6 sm:pb-16 sm:pt-4">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
