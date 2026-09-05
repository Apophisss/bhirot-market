"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/admin", label: "סקירה" },
  { href: "/admin/traffic", label: "תנועה" },
  { href: "/admin/markets", label: "שווקים" },
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/questions", label: "שאלה חדשה" },
  { href: "/admin/inbox", label: "תיבה" },
  { href: "/admin/bundle", label: "באנדל נתונים" },
];

export const RANGES = [1, 7, 30, 90] as const;
const RANGE_LABELS: Record<number, string> = { 1: "24 שעות", 7: "7 ימים", 30: "30 יום", 90: "90 יום" };

export function AdminNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const days = Number(params.get("days")) || 7;
  const withDays = (href: string, d: number) => (d === 7 ? href : `${href}?days=${d}`);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={withDays(t.href, days)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                active ? "bg-accent/15 text-accent-2" : "text-muted hover:bg-surface-2 hover:text-text-strong"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-1 text-xs">
        <span className="me-1 text-muted-2">טווח:</span>
        {RANGES.map((d) => (
          <Link
            key={d}
            href={withDays(pathname, d)}
            className={`rounded-md px-2 py-1 font-semibold ${d === days ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
          >
            {RANGE_LABELS[d]}
          </Link>
        ))}
      </div>
    </div>
  );
}
