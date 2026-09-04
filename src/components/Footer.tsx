import Link from "next/link";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {SITE_NAME} הוא משחק חיזויים <strong className="text-text">בכסף וירטואלי בלבד</strong>. אין כאן הימורים, כסף אמיתי או ייעוץ.
          השאלות נכתבות ומתעדכנות על ידי {SITE_TEAM} ומבוססות על פרסומים פומביים.
        </p>
        <nav className="flex shrink-0 gap-4">
          <Link href="/about" className="hover:text-text-strong">איך זה עובד</Link>
          <Link href="/about#updates" className="hover:text-text-strong">העדכון השעתי</Link>
        </nav>
      </div>
    </footer>
  );
}
