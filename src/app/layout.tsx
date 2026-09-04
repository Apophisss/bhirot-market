import type { Metadata } from "next";
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
  openGraph: {
    siteName: SITE_NAME,
    locale: "he_IL",
    type: "website",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE_TAGLINE }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="flex min-h-dvh flex-col">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-4 sm:px-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
