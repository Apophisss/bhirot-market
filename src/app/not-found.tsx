import Link from "next/link";
import { BoltIcon } from "@/components/BoltIcon";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/config";
import { shareCard } from "@/lib/seo";

const DESCRIPTION = "הקישור הזה לא מוביל לשום דף באתר. יש עוד הרבה שאלות פתוחות שמחכות לתשובה.";

/*
  Two things were wrong here, and both came from what this page did *not* say.

  Next emits its own `<meta name="robots" content="noindex">` on the not-found
  boundary — but metadata is merged from the root layout down, and the layout says
  `index, follow`, so a 404 shipped both and which one a crawler believed was its own
  business. `robots: null` is the fix rather than `robots: { index: false }`: the
  latter only replaces the contradiction with a duplicate, because Next's own tag is
  emitted either way. Null drops the inherited rule and leaves exactly one noindex,
  which is the one the framework already got right.

  The share card was inherited whole for the same reason, and its og:url is the
  layout's "/" — so a dead link forwarded into a chat previewed as the home page and
  claimed to *be* the home page. There is no way to name the URL that was actually
  requested from a static `metadata` export, but /404 is at least honest: it is a URL
  that renders this page and answers 404, which is precisely what this is.
*/
export const metadata: Metadata = {
  title: "הדף לא נמצא",
  description: DESCRIPTION,
  robots: null,
  ...shareCard({ title: `הדף לא נמצא | ${SITE_NAME}`, description: DESCRIPTION, path: "/404" }),
};

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center sm:mt-16 sm:p-10">
      <div className="tabular text-sm font-semibold text-muted-2">404</div>
      <h1 className="mt-2 text-2xl font-bold text-text-strong">הדף לא נמצא</h1>
      <p className="mt-2 text-muted">אולי השוק הזה עדיין לא נפתח, או שהקישור שגוי. יש עוד הרבה שאלות פתוחות שמחכות לתשובה.</p>
      {/* a dead end is still a visitor with intent — send them to the deck, not to a grid */}
      <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <Link
          href="/rapid"
          data-evt="404-rapid"
          className="tap pressable inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 font-bold text-white hover:bg-accent-2"
        >
          <BoltIcon size={16} />
          למצב זריז
        </Link>
        <Link
          href="/"
          className="tap pressable inline-flex items-center justify-center rounded-lg border border-border-2 px-5 font-semibold text-text hover:bg-surface-2"
        >
          לרשימת השאלות
        </Link>
      </div>
    </div>
  );
}
