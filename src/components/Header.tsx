import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/lib/auth";
import { SITE_NAME } from "@/lib/config";
import { PortfolioValue } from "./PortfolioValue";
import { Avatar } from "./Avatar";
import { UserMenu } from "./UserMenu";
import { MobileNav } from "./MobileNav";

// The leaderboard is deliberately absent: it hangs off the profile (the user menu
// below and /portfolio), not off the main navigation.
const NAV = [
  { href: "/", label: "שווקים", evt: "nav-markets" },
  { href: "/rapid", label: "מצב זריז", evt: "nav-rapid" },
  { href: "/activity", label: "פעילות", evt: "nav-activity" },
  { href: "/about", label: "איך זה עובד", evt: "nav-about" },
];

export async function Header() {
  const session = await auth();
  const user = session?.user;

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 shadow-[0_1px_3px_rgba(10,16,32,0.05)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <Image src="/logo.svg" alt="" width={32} height={32} priority className="h-8 w-8 sm:h-9 sm:w-9" />
            <span className="text-base font-extrabold tracking-tight text-text-strong sm:text-lg">{SITE_NAME}</span>
            <span className="hidden rounded-full border border-border-2 bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent md:inline">
              בחירות 2026
            </span>
          </Link>

          {/* below md the search lives above the board itself (see MarketBrowser) */}
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
                type="search"
                placeholder="חיפוש שוק: נתניהו, סקר, בנט…"
                className="w-full rounded-xl border border-border bg-surface-2 py-2 pr-10 pl-3 text-sm outline-none placeholder:text-muted-2 focus:border-accent focus:bg-surface"
              />
            </label>
          </form>

          <nav className="ms-auto hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-evt={n.evt}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-accent"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          {/* on phones and tablets the tab bar at the bottom carries the navigation */}
          <div className="ms-auto flex shrink-0 items-center gap-2 lg:ms-0">
            {user ? (
              <>
                <PortfolioValue />
                <UserMenu
                  trigger={
                    <>
                      <Avatar name={user.name} image={user.image} size={30} />
                      <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">{user.name}</span>
                      <span aria-hidden className="text-[10px] text-muted-2">▾</span>
                    </>
                  }
                >
                  <Link href="/portfolio" className="block px-4 py-3 text-sm hover:bg-surface-2">התיק שלי</Link>
                  <Link href="/leaderboard" data-evt="menu-leaderboard" className="block px-4 py-3 text-sm hover:bg-surface-2">לוח המובילים</Link>
                  <Link href="/about" className="block px-4 py-3 text-sm hover:bg-surface-2">איך זה עובד</Link>
                  <form action={doSignOut}>
                    <button className="block w-full px-4 py-3 text-right text-sm text-no hover:bg-surface-2">התנתקות</button>
                  </form>
                </UserMenu>
              </>
            ) : (
              <>
                <Link href="/about" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-text-strong sm:inline lg:hidden">
                  איך זה עובד
                </Link>
                <Link
                  href="/login"
                  data-evt="header-login"
                  className="pressable rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
                >
                  התחברות
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <MobileNav loggedIn={Boolean(user)} />
    </>
  );
}
