import Link from "next/link";
import { REFERRAL_BONUS } from "@/lib/referral";
import { money } from "@/lib/format";

/**
 * The offer, as a strip on the board: share the site with your own link, get
 * {REFERRAL_BONUS} virtual shekels for every friend who signs up through it.
 * The link itself lives on /invite — this is only the invitation to go get it.
 */
export function InvitePromo({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="card overflow-hidden border-accent/30 bg-accent-soft">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <span aria-hidden className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-xl text-white sm:flex">
          🎁
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-text-strong sm:text-base">
            <span aria-hidden className="sm:hidden">🎁 </span>
            שתפו את האתר וקבלו {money(REFERRAL_BONUS)} על כל חבר/ה
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted sm:text-sm">
            לכל משתמש/ת יש קישור אישי. כל מי שנרשם דרכו מוסיף לכם {money(REFERRAL_BONUS)} לניקוד — ומגיע לכם
            עוד מישהו להתווכח איתו על הסקרים.
          </p>
        </div>
        <Link
          href="/invite"
          className="tap pressable inline-flex shrink-0 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
        >
          {loggedIn ? "לקישור שלי" : "לקבלת הקישור"}
        </Link>
      </div>
    </section>
  );
}
