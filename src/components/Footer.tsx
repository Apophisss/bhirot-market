import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ink bg-ink">
      <div className="mx-auto max-w-7xl px-4 py-7 text-xs leading-relaxed text-white/60 sm:px-6 sm:py-8">
        {/* every category landing page is one click from every page on the site */}
        <nav aria-label="קטגוריות" className="-mt-1 flex flex-wrap gap-x-4 gap-y-1 border-b border-white/10 pb-4">
          {CATEGORIES.map((c) => (
            <Link key={c.id} href={`/category/${c.id}`} className="inline-flex items-center py-1.5 hover:text-white">
              {c.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {SITE_NAME} הוא משחק חיזויים <strong className="text-white">בכסף וירטואלי בלבד</strong>. אין כאן הימורים, כסף אמיתי או ייעוץ.
            השאלות נכתבות ומתעדכנות על ידי {SITE_TEAM} ומבוססות על פרסומים פומביים.
          </p>
          <nav className="-my-1 flex shrink-0 flex-wrap gap-x-4">
            <Link href="/about" className="inline-flex items-center py-2 hover:text-white">איך זה עובד</Link>
            <Link href="/about#faq" className="inline-flex items-center py-2 hover:text-white">שאלות ותשובות</Link>
            <Link href="/about#updates" className="inline-flex items-center py-2 hover:text-white">מי כותב את השאלות</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
