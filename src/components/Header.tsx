import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/lib/auth";
import { SITE_NAME } from "@/lib/config";
import { UserBalance } from "./UserBalance";
import { Avatar } from "./Avatar";
import { BoltIcon } from "./BoltIcon";

const NAV = [
  { href: "/", label: "שווקים" },
  { href: "/rapid", label: "מצב זריז" },
  { href: "/activity", label: "פעילות" },
  { href: "/leaderboard", label: "מובילים" },
  { href: "/about", label: "איך זה עובד" },
];

export async function Header() {
  const session = await auth();
  const user = session?.user;

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 shadow-[0_1px_3px_rgba(10,16,32,0.05)] backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Image src="/logo.svg" alt="" width={36} height={36} priority />
          <span className="text-lg font-extrabold tracking-tight text-text-strong">{SITE_NAME}</span>
          <span className="hidden rounded-full border border-border-2 bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent md:inline">
            בחירות 2026
          </span>
        </Link>

        <form action="/" className="hidden flex-1 md:block">
          <label className="relative block max-w-md">
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              name="q"
              placeholder="חיפוש שוק: נתניהו, סקר, בנט…"
              className="w-full rounded-xl border border-border bg-surface-2 py-2 pr-10 pl-3 text-sm outline-none placeholder:text-muted-2 focus:border-accent focus:bg-surface"
            />
          </label>
        </form>

        <nav className="ms-auto hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-accent">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/rapid"
            title="מצב זריז — שאלה אחרי שאלה, כן או לא"
            className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-2 text-sm font-bold text-accent-2 hover:bg-accent/20 lg:hidden"
          >
            <BoltIcon />
            <span className="hidden sm:inline">מצב זריז</span>
            <span className="sr-only sm:hidden">מצב זריז</span>
          </Link>
          {user ? (
            <>
              <UserBalance />
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-surface-2 p-1 pl-3 hover:border-border-2">
                  <Avatar name={user.name} image={user.image} size={30} />
                  <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">{user.name}</span>
                </summary>
                <div className="absolute left-0 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-ink/10">
                  <Link href="/portfolio" className="block px-4 py-2.5 text-sm hover:bg-surface-2">התיק שלי</Link>
                  <Link href="/activity" className="block px-4 py-2.5 text-sm hover:bg-surface-2 lg:hidden">פעילות</Link>
                  <Link href="/leaderboard" className="block px-4 py-2.5 text-sm hover:bg-surface-2 lg:hidden">מובילים</Link>
                  <Link href="/about" className="block px-4 py-2.5 text-sm hover:bg-surface-2 lg:hidden">איך זה עובד</Link>
                  <form action={doSignOut}>
                    <button className="block w-full px-4 py-2.5 text-right text-sm text-no hover:bg-surface-2">התנתקות</button>
                  </form>
                </div>
              </details>
            </>
          ) : (
            <>
              <Link href="/about" className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-text-strong lg:hidden">
                איך זה עובד
              </Link>
              <Link
                href="/login"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
              >
                התחברות
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
