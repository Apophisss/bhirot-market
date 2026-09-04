import Link from "next/link";
import { SITE_NAME } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ink bg-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {SITE_NAME} הוא משחק חיזויים <strong className="text-white">בכסף וירטואלי בלבד</strong>. אין כאן הימורים, כסף אמיתי או ייעוץ.
          השאלות נכתבות ומתעדכנות אוטומטית על ידי Claude ומבוססות על פרסומים פומביים.
        </p>
        <nav className="flex shrink-0 gap-4">
          <Link href="/about" className="hover:text-white">איך זה עובד</Link>
          <Link href="/about#claude" className="hover:text-white">העדכון האוטומטי</Link>
          <a href="https://github.com/Apophisss/bhirot-market" className="hover:text-white" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
