import Link from "next/link";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ink bg-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs leading-relaxed text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-7">
        <p>
          {SITE_NAME} הוא משחק חיזויים <strong className="text-white">בכסף וירטואלי בלבד</strong>. אין כאן הימורים, כסף אמיתי או ייעוץ.
          השאלות נכתבות ומתעדכנות על ידי {SITE_TEAM} ומבוססות על פרסומים פומביים.
        </p>
        <nav className="-my-1 flex shrink-0 gap-4">
          <Link href="/about" className="inline-flex items-center py-2 hover:text-white">איך זה עובד</Link>
          <Link href="/about#updates" className="inline-flex items-center py-2 hover:text-white">העדכון השעתי</Link>
        </nav>
      </div>
    </footer>
  );
}
