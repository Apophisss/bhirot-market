import Link from "next/link";
import { BoltIcon } from "@/components/BoltIcon";
import type { Metadata } from "next";

// Next emits its own `noindex` on this boundary and the response is a real 404, so
// only the title is missing: without it every dead link is labelled with the site default.
export const metadata: Metadata = {
  title: "הדף לא נמצא",
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
