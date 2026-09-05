"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Routes there is no point coming back to after signing in. */
const NO_RETURN = ["/login", "/onboarding", "/welcome"];

/**
 * Where a sign-in goes when there is nothing to come back to. The deck, not the
 * board: a fresh account with a full balance and no answer to its name should land
 * on a question, not on a grid of them.
 */
const DEFAULT_RETURN = "/rapid";

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
  if (!pathname || NO_RETURN.some((p) => pathname.startsWith(p))) return DEFAULT_RETURN;
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
  const router = useRouter();
  return (
    <Link
      href={`/login?callbackUrl=${encodeURIComponent(returnTo)}`}
      data-evt={evt}
      className={className}
      onClick={(e) => {
        // The href is rendered from `useSearchParams`, which is right for every
        // ordinary page. On a market page the trade panel keeps annotating the URL
        // with the side and amount as they are typed, and the last annotation can
        // land after this link has rendered — so the destination is recomputed from
        // the live location at the moment of the click, which is the moment that
        // decides where the visitor comes back to.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        const here = window.location.pathname + window.location.search;
        const back = NO_RETURN.some((p) => window.location.pathname.startsWith(p)) ? DEFAULT_RETURN : here;
        router.push(`/login?callbackUrl=${encodeURIComponent(back)}`);
      }}
    >
      {children}
    </Link>
  );
}
