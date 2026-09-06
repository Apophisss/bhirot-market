import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { auth, signOut } from "@/lib/auth";
import { SITE_NAME } from "@/lib/config";
import { REFERRAL_BONUS } from "@/lib/referral";
import { money } from "@/lib/format";
import { PortfolioValue } from "./PortfolioValue";
import { Avatar } from "./Avatar";
import { UserMenu } from "./UserMenu";
import { MobileNav } from "./MobileNav";
import { MobileSearch } from "./MobileSearch";
import { LoginLink } from "./LoginLink";
import { RapidGuestSync } from "./RapidGuestSync";
import { RapidEntryGate } from "./RapidEntryGate";
import { needsSurvey } from "@/lib/preferences-store";
import { countIncomingRequests } from "@/lib/friends";
import { countLeagueInvites } from "@/lib/leagues";

// The leaderboard is deliberately absent: it hangs off the profile (the user menu
// below and /portfolio), not off the main navigation.
const NAV = [
  { href: "/", label: "שאלות", evt: "nav-markets" },
  { href: "/rapid", label: "מצב זריז", evt: "nav-rapid" },
  { href: "/activity", label: "פעילות", evt: "nav-activity" },
  { href: "/about", label: "איך זה עובד", evt: "nav-about" },
];

const LOGIN_BUTTON =
  "tap pressable inline-flex items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white shadow-md shadow-accent/25 hover:bg-accent-2";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  // תג קטן ליד "ההעדפות שלי" למי שעדיין לא ענה על השאלון — הדרך הקבועה להגיע אליו,
  // גם אחרי ש"לא עכשיו" הסתיר את ההצעה שעל גבי הדפים
  // ובאותה נשימה: בקשות חברות והזמנות לליגה שממתינות לתשובה. בקשה שאיש לא רואה היא
  // בקשה שלא נענית, ואין באתר שום ערוץ אחר שמודיע עליה
  const [askSurvey, friendRequests, leagueInvites] = await Promise.all([
    needsSurvey(user?.id),
    countIncomingRequests(user?.id),
    countLeagueInvites(user?.id),
  ]);

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 shadow-[0_1px_3px_rgba(10,16,32,0.05)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6">
          <Link href="/" className="tap flex shrink-0 items-center gap-2 sm:gap-2.5">
            <Image src="/logo.svg" alt="" width={32} height={32} priority className="h-8 w-8 sm:h-9 sm:w-9" />
            <span className="text-base font-extrabold tracking-tight text-text-strong sm:text-lg">{SITE_NAME}</span>
            <span className="hidden rounded-full border border-border-2 bg-accent-soft px-2 py-0.5 text-[13px] font-semibold text-accent md:inline">
              בחירות 2026
            </span>
          </Link>

          {/* below md the field is replaced by an icon that opens a full-screen sheet */}
          <MobileSearch />

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
                placeholder="חיפוש שאלה: נתניהו, סקר, בנט…"
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
                      {/* the badges themselves live inside the closed menu, so the avatar
                          carries a dot — otherwise a waiting request is invisible */}
                      <span className="relative flex">
                        <Avatar name={user.name} image={user.image} size={30} />
                        {friendRequests + leagueInvites > 0 && (
                          <span
                            aria-label={`${friendRequests + leagueInvites} בקשות שממתינות`}
                            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent"
                          />
                        )}
                      </span>
                      <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">{user.name}</span>
                      <span aria-hidden className="text-[13px] text-muted-2">▾</span>
                    </>
                  }
                >
                  <Link href="/portfolio" className="block px-4 py-3 text-sm hover:bg-surface-2">הניקוד שלי</Link>
                  <Link href="/leaderboard" data-evt="menu-leaderboard" className="block px-4 py-3 text-sm hover:bg-surface-2">לוח המובילים</Link>
                  <Link href="/friends" data-evt="menu-friends" className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-2">
                    החברים שלי
                    {friendRequests > 0 && (
                      <span className="tabular shrink-0 rounded-full bg-accent px-2 py-0.5 text-[13px] font-bold text-white">
                        {friendRequests}
                      </span>
                    )}
                  </Link>
                  <Link href="/leagues" data-evt="menu-leagues" className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-2">
                    הליגות שלי
                    {leagueInvites > 0 && (
                      <span className="tabular shrink-0 rounded-full bg-accent px-2 py-0.5 text-[13px] font-bold text-white">
                        {leagueInvites}
                      </span>
                    )}
                  </Link>
                  <Link href="/invite" className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-2">
                    הזמינו חברים
                    <span className="tabular shrink-0 rounded-full bg-yes/15 px-2 py-0.5 text-[13px] font-bold text-yes">{money(REFERRAL_BONUS)}</span>
                  </Link>
                  <Link href="/onboarding?edit=1" data-evt="menu-preferences" className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-2">
                    ההעדפות שלי
                    {askSurvey && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[13px] font-bold text-accent-2">שאלון קצר</span>
                    )}
                  </Link>
                  <Link href="/suggest" className="block px-4 py-3 text-sm hover:bg-surface-2">הצעת שאלה</Link>
                  <Link href="/contact" className="block px-4 py-3 text-sm hover:bg-surface-2">יצירת קשר</Link>
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
                {/* useSearchParams needs a boundary; the fallback is the same button
                    pointing at a bare /login, which is what it used to be everywhere */}
                <Suspense
                  fallback={
                    <Link href="/login" data-evt="header-login" className={LOGIN_BUTTON}>
                      התחברות
                    </Link>
                  }
                >
                  <LoginLink evt="header-login" className={LOGIN_BUTTON}>
                    התחברות
                  </LoginLink>
                </Suspense>
              </>
            )}
          </div>
        </div>
      </header>
      <MobileNav loggedIn={Boolean(user)} />
      {/* the rapid answers a visitor gave before signing in become positions here —
          in the header, because the sign-in flow lands on /onboarding, not on /rapid.
          Each answer redeems at the amount it was given at, and the amount itself is
          adopted by the new account (src/components/RapidGuestSync.tsx) */}
      <RapidGuestSync loggedIn={Boolean(user)} />
      {/* ההצעה שפותחת כל ביקור: מצב זריז, ומתחילים לשחק. כאן ולא בעמוד מסוים, כי היא
          שייכת לכניסה לאתר ולא לדף הבית — ובהדר ממילא כבר ידוע אם המבקר מחובר
          (src/components/RapidEntryGate.tsx) */}
      <RapidEntryGate loggedIn={Boolean(user)} />
    </>
  );
}
