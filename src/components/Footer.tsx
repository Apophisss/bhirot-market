import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ink bg-ink">
      <div className="mx-auto max-w-7xl px-4 py-8 text-xs text-white/60 sm:px-6">
        {/* every category landing page is one click from every page on the site */}
        <nav aria-label="קטגוריות" className="flex flex-wrap gap-x-4 gap-y-2 border-b border-white/10 pb-5">
          {CATEGORIES.map((c) => (
            <Link key={c.id} href={`/category/${c.id}`} className="hover:text-white">
              {c.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {SITE_NAME} הוא משחק חיזויים <strong className="text-white">בכסף וירטואלי בלבד</strong>. אין כאן הימורים, כסף אמיתי או ייעוץ.
            השאלות נכתבות ומתעדכנות על ידי {SITE_TEAM} ומבוססות על פרסומים פומביים.
          </p>
          <nav className="flex shrink-0 gap-4">
            <Link href="/about" className="hover:text-white">איך זה עובד</Link>
            <Link href="/about#faq" className="hover:text-white">שאלות ותשובות</Link>
            <Link href="/about#updates" className="hover:text-white">מי כותב את השאלות</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
