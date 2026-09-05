"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Icons are inline so the bar paints with the first HTML byte — no icon font, no request. */
const ICONS = {
  markets: "M4 13h5V4H4v9Zm0 7h5v-5H4v5Zm7 0h5V11h-5v9Zm7 0h5V8h-5v12ZM11 9h5V4h-5v5Z",
  activity: "M3 12h4l3 8 4-16 3 8h4",
  wallet: "M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h-4a3 3 0 0 0 0 6h4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm14 3h4v2h-4a1 1 0 1 1 0-2Z",
  // podium: three bars with the tallest in the middle
  trophy: "M4 20h16v2H4v-2Zm5-9h6v8H9v-8Zm-6 3h5v5H3v-5Zm13-7h5v12h-5V7Z",
  // same glyph as BoltIcon, so rapid mode is marked identically everywhere
  bolt: "M13.5 2 4 13.5h6L9.5 22 20 10.5h-6.5L13.5 2Z",
} as const;

type Item = { href: string; label: string; icon: keyof typeof ICONS; stroke?: boolean };

/*
  Four slots, and every one of them has to earn its place on a phone.

  - "פעילות" is gone: it is a stream of anonymous strangers' trades, which is the
    least useful thing a phone-sized navigation can point at. It now lives at the
    bottom of a question's own page, where the trades are about the question the
    reader is looking at.
  - "לוח המובילים" takes its place. It was reachable only from the profile menu,
    which meant a signed-out visitor had no route to it at all — and it is the one
    page that answers "is anyone actually any good at this?".
  - "התחברות" is gone too: the header carries a full blue login button on every
    single page, so the tab-bar copy was the third "התחברות" on one screen.
*/
const BASE: Item[] = [
  { href: "/", label: "שאלות", icon: "markets" },
  { href: "/rapid", label: "מצב זריז", icon: "bolt" },
  { href: "/leaderboard", label: "המובילים", icon: "trophy" },
];

/**
 * Thumb-reachable tab bar. The header nav only appears from `lg` up, so on phones and
 * tablets this is the site's primary navigation — on every route, rapid mode included:
 * the deck there sizes itself against the bar (`.deck-height`) instead of under it.
 */
export function MobileNav({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const items: Item[] = loggedIn ? [...BASE, { href: "/portfolio", label: "הניקוד שלי", icon: "wallet" }] : BASE;

  return (
    <nav
      data-mobile-nav
      aria-label="ניווט ראשי"
      className="pb-safe px-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur lg:hidden"
      style={{ boxShadow: "0 -1px 12px rgba(10,16,32,0.06)" }}
    >
      <ul className="mx-auto flex max-w-xl">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                data-evt="mobilenav"
                data-evt-label={it.label}
                aria-current={active ? "page" : undefined}
                className={`pressable flex h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-semibold sm:text-[11px] ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
                  <path
                    d={ICONS[it.icon]}
                    fill={it.stroke ? "none" : "currentColor"}
                    stroke={it.stroke ? "currentColor" : "none"}
                    strokeWidth={it.stroke ? 2 : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
