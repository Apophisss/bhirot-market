import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";
import { isAdmin } from "@/lib/admin";
import { InstallLink } from "@/components/InstallApp";

export async function Footer() {
  // the admin link only exists for admins; everyone else sees the usual footer
  const admin = await isAdmin();
  return (
    <footer className="mt-auto border-t border-ink bg-ink">
      <div className="mx-auto max-w-7xl px-4 py-7 text-xs leading-relaxed text-white/60 sm:px-6 sm:py-8">
        {/* Every category landing page is one click from every page on the site.
            Each link is its own 44px thumb target (`tap` plus `min-w-11`), and
            `gap-y-2` keeps two wrapped rows from touching: eleven links this
            close together on a phone are the easiest place on the site to hit
            the wrong one. */}
        <nav aria-label="קטגוריות" className="-mt-1 flex flex-wrap gap-x-4 gap-y-2 border-b border-white/10 pb-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.id}`}
              data-evt="footer-category"
              data-evt-label={c.label}
              className="tap inline-flex min-w-11 items-center justify-center hover:text-white"
            >
              {c.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {/* The disclosure, in the one wording the copy dictionary allows, said
              once: points only, no real money, no prizes and no payment. The
              word "תשלום" survives here and nowhere else on the site precisely
              because here it is being denied — it is the term an ad reviewer
              and the gambling test look for, and this line is the answer. */}
          <p>
            {SITE_NAME} הוא משחק ידע <strong className="text-white">בנקודות משחק בלבד</strong>. אין כסף אמיתי, אין פרסים ואין תשלום — וגם לא ייעוץ.
            השאלות נכתבות ומתעדכנות על ידי {SITE_TEAM} ומבוססות על פרסומים פומביים.
          </p>
          {/*
            `shrink-0` on a wrapping list of eleven links asked for all of them on one
            line — 868px of them. Between 640 and 1023 CSS px (a phone held sideways, a
            tablet in portrait) that is wider than the page, and because the site is RTL
            the overflow lands *outside* the right edge: the whole layout paints shifted,
            the header logo and the right-hand side of the rapid card go off screen, and
            `overflow-x: clip` on <body> means there is no scrolling to them. The links
            wrap instead; nothing else about the footer changes.
          */}
          <nav className="-my-1 flex min-w-0 flex-wrap gap-x-4">
            <Link href="/rapid" data-evt="footer-rapid" className="tap inline-flex min-w-11 items-center justify-center font-semibold text-white hover:text-white">מצב זריז</Link>
            <Link href="/about" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">איך זה עובד</Link>
            <Link href="/invite" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">הזמינו חברים</Link>
            <Link href="/about#faq" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">שאלות ותשובות</Link>
            <Link href="/about#updates" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">מי כותב את השאלות</Link>
            <Link href="/suggest" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">הצעת שאלה</Link>
            <Link href="/contact" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">יצירת קשר</Link>
            <Link href="/privacy" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">פרטיות</Link>
            <Link href="/terms" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">תנאי שימוש</Link>
            {/* האפשרות הקבועה שמאחורי כרטיס ההמלצה בלוח, בכל עמוד ובכל פלטפורמה.
                נעלמת מעצמה רק כשהאתר באמת מותקן */}
            <InstallLink />
            {admin && (
              <Link href="/admin" data-evt="footer-link" className="tap inline-flex min-w-11 items-center justify-center hover:text-white">ניהול</Link>
            )}
          </nav>
        </div>
      </div>
    </footer>
  );
}
