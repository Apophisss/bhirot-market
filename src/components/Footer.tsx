import Link from "next/link";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";
import { isAdmin } from "@/lib/admin";

export async function Footer() {
  // the admin link only exists for admins; everyone else sees the usual footer
  const admin = await isAdmin();
  return (
    <footer className="mt-auto border-t border-ink bg-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {SITE_NAME} הוא משחק חיזויים <strong className="text-white">בכסף וירטואלי בלבד</strong>. אין כאן הימורים, כסף אמיתי או ייעוץ.
          השאלות נכתבות ומתעדכנות על ידי {SITE_TEAM} ומבוססות על פרסומים פומביים.
        </p>
        <nav className="flex shrink-0 gap-4">
          <Link href="/about" data-evt="footer-link" className="hover:text-white">איך זה עובד</Link>
          <Link href="/about#updates" data-evt="footer-link" className="hover:text-white">העדכון השעתי</Link>
          {admin && (
            <Link href="/admin" data-evt="footer-link" className="hover:text-white">ניהול</Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
