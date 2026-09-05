import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findUserByReferralCode } from "@/lib/referral-program";
import { invitePath, REFERRAL_BONUS } from "@/lib/referral";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/config";
import { getMarketStats } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { money } from "@/lib/format";
import { displayOpenCount } from "@/lib/display-stats";
import { Avatar } from "@/components/Avatar";
import { Countdown } from "@/components/Countdown";
import { BoltIcon } from "@/components/BoltIcon";
import { shareCard } from "@/lib/seo";

export const dynamic = "force-dynamic";

const DESCRIPTION = `הוזמנתם ל${SITE_NAME} — ${SITE_TAGLINE}. נרשמים, מקבלים 10,000 נקודות, ומתחילים לנחש סקרים, קואליציות ומהלכים פוליטיים.`;

/**
 * The page a shared invite link lands on. The code is picked up from the URL by
 * middleware (which is what actually stamps the cookie); everything here is the welcome
 * — who invited you, what the site is, and one button to sign up.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const inviter = await findUserByReferralCode(code);
  const title = inviter?.name ? `${inviter.name} הזמינו אתכם ל${SITE_NAME}` : `הוזמנתם ל${SITE_NAME}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description: DESCRIPTION,
    // one page per invite code, all of them the same content: never index them
    robots: { index: false, follow: true },
    // the most-shared link on the site: a personal invite pasted into a chat, so its
    // preview has to carry the picture as well as the name
    ...shareCard({ title, description: DESCRIPTION, path: invitePath(code) }),
  };
}

export default async function InviteLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [inviter, session] = await Promise.all([findUserByReferralCode(code), auth()]);
  // an expired or mistyped link is not a dead end — send the visitor to the board itself
  if (!inviter) redirect("/");

  await ensureSynced();
  const stats = await getMarketStats();
  const alreadyIn = Boolean(session?.user);

  return (
    <div className="mx-auto max-w-2xl space-y-5 sm:mt-6 sm:space-y-6">
      <section className="hero-dark relative overflow-hidden rounded-2xl border border-brand-deep sm:rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-l from-ink/90 via-brand-deep/70 to-brand-deep/20" />
        <div className="relative p-5 sm:p-8">
          <div className="flex items-center gap-3">
            <Avatar name={inviter.name} image={inviter.image} size={44} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{inviter.name ?? "אחד השחקנים"}</div>
              <div className="text-xs text-white/70">הזמינו אתכם למשחק</div>
            </div>
          </div>
          <h1 className="mt-4 text-[25px] font-black leading-tight text-white sm:text-4xl">{SITE_TAGLINE}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-lg">
            {displayOpenCount(stats.open)} שאלות פתוחות על הקמפיין — סקרים, קואליציה, משפט נתניהו ומה שיקרה עד יום הבחירות. נרשמים,
            מקבלים <strong className="text-white">{money(STARTING_BALANCE)}</strong>, ומתחילים לנחש.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {alreadyIn ? (
              <>
                <Link
                  href="/rapid"
                  className="tap pressable inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft"
                >
                  <BoltIcon size={16} />
                  למצב הזריז
                </Link>
                <Link
                  href="/invite"
                  className="tap pressable inline-flex items-center justify-center rounded-xl border border-white/35 bg-white/10 px-5 py-3 font-semibold text-white hover:bg-white/20"
                >
                  הקישור שלי להזמנות
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="tap pressable inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft"
                >
                  הצטרפות · {money(STARTING_BALANCE)}
                </Link>
                <Link
                  href="/"
                  className="tap pressable inline-flex items-center justify-center rounded-xl border border-white/35 bg-white/10 px-5 py-3 font-semibold text-white hover:bg-white/20"
                >
                  קודם נסתכל על השאלות
                </Link>
              </>
            )}
          </div>
          <div className="mt-5 inline-flex">
            <Countdown />
          </div>
        </div>
      </section>

      {alreadyIn ? (
        <p className="card p-4 text-sm leading-relaxed text-muted">
          אתם כבר רשומים, כך שההזמנה הזו לא מזכה בבונוס — אבל <Link href="/invite" className="text-accent-2 hover:underline">הקישור שלכם</Link>{" "}
          כן: {money(REFERRAL_BONUS)} על כל חבר/ה שיצטרפו דרככם.
        </p>
      ) : (
        <section className="card p-4 sm:p-5">
          <h2 className="font-bold text-text-strong">מה זה {SITE_NAME}?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            משחק ניחושים על הבחירות לכנסת ה־26, <strong className="text-text">בנקודות משחק בלבד</strong> — אין כסף אמיתי,
            אין פרסים ואין תשלום. עונים ״כן״ או ״לא״ על שאלה, מד הניחושים מראה כמה בטוחים בה השחקנים, וכל תשובה שצדקה שווה
            נקודה. אחרי ההרשמה תקבלו גם קישור אישי משלכם, שמזכה אתכם ב{money(REFERRAL_BONUS)} על כל חבר/ה שתביאו.
          </p>
          <Link href="/about" className="mt-3 inline-flex items-center py-1 text-sm text-accent-2 hover:underline">
            איך זה עובד בדיוק
          </Link>
        </section>
      )}
    </div>
  );
}
