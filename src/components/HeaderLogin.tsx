"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoginLink } from "./LoginLink";

/**
 * The header's "התחברות", with one exception: the paid landing page.
 *
 * Everywhere else the blue button is right — it is the one way into an account
 * from a page that is not about accounts. On `/welcome` it was the largest and
 * brightest element above the fold, on a page whose headline, button and
 * sub-line all say "בלי הרשמה": the first thing a stranger who clicked an ad saw
 * was the site contradicting its own promise, and the second was a demand.
 * Measured on a 390px phone: the button sat at y=6, the first thing the visitor
 * could actually answer at y=918.
 *
 * So on that one page it becomes a quiet text link for the person it is really
 * for — someone who already has an account and landed on the pitch by mistake —
 * and the page's own bottom line ("כבר יש לכם חשבון?") says the same. The link
 * keeps the callback the button would have used, straight to the deck.
 */
/**
 * The deck gets the same treatment for a signed-out visitor: it is the screen the
 * landing card hands over to 900ms after the first tap, and it already carries the
 * account offer twice — the guest banner over the deck and the card's own footer.
 * A third, brighter "התחברות" in the header made the second screen a stranger ever
 * sees read as three demands for an account. The header is only rendered with this
 * component when nobody is signed in, so no check for that is needed here.
 */
const QUIET_ON = ["/welcome", "/rapid"];

export function HeaderLogin({ className, evt }: { className: string; evt: string }) {
  const pathname = usePathname();
  if (pathname && QUIET_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return (
      <Link
        href="/login?callbackUrl=%2Frapid"
        data-evt="header-login-quiet"
        className="tap inline-flex items-center rounded-lg px-2 text-[13px] font-semibold text-muted hover:text-text-strong"
      >
        כבר רשומים?
      </Link>
    );
  }
  return (
    <LoginLink evt={evt} className={className}>
      התחברות
    </LoginLink>
  );
}
