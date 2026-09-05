"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/** Routes there is no point coming back to after signing in. */
const NO_RETURN = ["/login", "/onboarding", "/welcome"];

/**
 * The current location, as a `callbackUrl` — query string included.
 *
 * The query is the part that was missing: `/market/<slug>?side=no&amount=25`
 * carries the side and the stake the visitor had already chosen, and the market
 * page hands both straight back to the trade panel, so signing in from the header
 * returns them to the form they were filling in rather than to a blank one.
 */
export function useReturnTo(): string {
  const pathname = usePathname();
  const params = useSearchParams();
  if (!pathname || NO_RETURN.some((p) => pathname.startsWith(p))) return "/";
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * A "התחברות" link that remembers where it was clicked.
 *
 * Every login entry point on the site now goes through this. The trade panel's own
 * button already passed a `callbackUrl`; the header's did not, so signing in from
 * the header dropped the visitor on the home page and made them find their way back
 * to the question they were about to answer.
 */
export function LoginLink({
  className,
  children,
  evt,
}: {
  className?: string;
  children: React.ReactNode;
  evt?: string;
}) {
  const returnTo = useReturnTo();
  return (
    <Link href={`/login?callbackUrl=${encodeURIComponent(returnTo)}`} data-evt={evt} className={className}>
      {children}
    </Link>
  );
}
