"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Icons are inline so the bar paints with the first HTML byte — no icon font, no request. */
const ICONS = {
  markets: "M4 13h5V4H4v9Zm0 7h5v-5H4v5Zm7 0h5V11h-5v9Zm7 0h5V8h-5v12ZM11 9h5V4h-5v5Z",
  activity: "M3 12h4l3 8 4-16 3 8h4",
  trophy: "M7 3h10v5a5 5 0 0 1-10 0V3Zm-2 1v3a2 2 0 0 0 2 2v2a4 4 0 0 1-4-4V4h2Zm14 0h2v3a4 4 0 0 1-4 4v-2a2 2 0 0 0 2-2V4ZM11 14h2v4h3v2H8v-2h3v-4Z",
  wallet: "M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h-4a3 3 0 0 0 0 6h4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm14 3h4v2h-4a1 1 0 1 1 0-2Z",
  login: "M10 17v-2H5V9h5V7l5 5-5 5Zm3-14a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6h-1v-2h1a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4h-1V3h1Z",
} as const;

type Item = { href: string; label: string; icon: keyof typeof ICONS; stroke?: boolean };

const BASE: Item[] = [
  { href: "/", label: "שווקים", icon: "markets" },
  { href: "/activity", label: "פעילות", icon: "activity", stroke: true },
  { href: "/leaderboard", label: "מובילים", icon: "trophy" },
];

/**
 * Thumb-reachable tab bar. The header nav only appears from `lg` up, so on phones and
 * tablets this is the site's primary navigation.
 */
export function MobileNav({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const items: Item[] = [
    ...BASE,
    loggedIn ? { href: "/portfolio", label: "התיק שלי", icon: "wallet" } : { href: "/login", label: "התחברות", icon: "login" },
  ];

  return (
    <nav
      aria-label="ניווט ראשי"
      className="pb-safe px-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur lg:hidden"
      style={{ boxShadow: "0 -1px 12px rgba(10,16,32,0.06)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`pressable flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
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
