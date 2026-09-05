import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getReferralSummary } from "@/lib/referral-program";
import { MAX_REFERRALS, REFERRAL_BONUS } from "@/lib/referral";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { SITE_NAME } from "@/lib/config";
import { money, timeAgo } from "@/lib/format";
import { InviteCard } from "@/components/InviteCard";
import { Avatar } from "@/components/Avatar";
import { StatTile } from "@/components/StatTile";

export const dynamic = "force-dynamic";

const DESCRIPTION = `שתפו את ${SITE_NAME} עם קישור אישי וקבלו ₪${REFERRAL_BONUS.toLocaleString("en-US")} וירטואליים על כל חבר/ה שנרשמים דרככם.`;

export const metadata: Metadata = {
  title: "הזמינו חברים",
  description: DESCRIPTION,
  alternates: { canonical: "/invite" },
  openGraph: { url: "/invite", title: `הזמינו חברים | ${SITE_NAME}`, description: DESCRIPTION },
};

const STEPS = [
  { n: "1", title: "מעתיקים את הקישור האישי", body: "כל משתמש/ת מקבלים קישור משלהם. הוא לא משתנה, אפשר לשלוח אותו שוב ושוב." },
  { n: "2", title: "שולחים לחברים", body: "וואטסאפ, קבוצה, סטורי — כל מקום שבו מדברים על הבחירות." },
  { n: "3", title: `מקבלים ${money(REFERRAL_BONUS)} על כל הרשמה`, body: "ברגע שהם נרשמים דרך הקישור, הבונוס נכנס ליתרה שלכם. גם הם מתחילים עם ₪10,000." },
];

export default async function InvitePage() {
  const user = await currentUser();
  const summary = user ? await getReferralSummary(user.id) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <section className="hero-dark relative overflow-hidden rounded-2xl border border-brand-deep p-5 sm:rounded-3xl sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-l from-ink/90 via-brand-deep/70 to-brand-deep/20" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/85">
            🎁 תוכנית ההזמנות
          </span>
          <h1 className="mt-3 text-[25px] font-black leading-tight text-white sm:text-4xl">
            {money(REFERRAL_BONUS)} על כל חבר/ה שמצטרפים דרככם
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75 sm:text-lg">
            שוק חיזויים שווה בדיוק כמו האנשים שמתווכחים בו. שתפו את {SITE_NAME} עם הקישור האישי שלכם, וכל מי שנרשם דרכו
            מוסיף לכם {money(REFERRAL_BONUS)} וירטואליים ליתרה — עד {MAX_REFERRALS} חברים.
          </p>
          {!user && (
            <Link
              href="/login?callbackUrl=/invite"
              className="tap pressable mt-5 inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft"
            >
              התחברות וקבלת הקישור שלי
            </Link>
          )}
        </div>
      </section>

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <StatTile label="חברים שהצטרפו" value={String(summary.invited)} hint={`מתוך ${MAX_REFERRALS} הזמנות מזכות`} />
            <StatTile
              label="בונוס שנצבר"
              value={money(summary.earned)}
              tone={summary.earned > 0 ? "yes" : undefined}
              hint={`${money(REFERRAL_BONUS)} לכל הרשמה`}
            />
          </div>

          <InviteCard code={summary.code} invited={summary.invited} earned={summary.earned} remaining={summary.remaining} />

          {summary.friends.length > 0 && (
            <section className="card overflow-hidden">
              <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">מי הצטרף דרככם</h2>
              <ul className="divide-y divide-border">
                {summary.friends.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={f.name} image={f.image} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{f.name ?? "אנונימי"}</span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(f.joinedAt)}</span>
                    <span className={`tabular shrink-0 text-sm font-bold ${f.bonus > 0 ? "text-yes" : "text-muted-2"}`}>
                      {f.bonus > 0 ? `+${money(f.bonus)}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section className="card p-4 sm:p-5">
          <p className="text-sm leading-relaxed text-text">
            הקישור האישי נוצר ברגע שמתחברים. ההתחברות היא עם Google, אורכת שתי שניות, ומזכה גם אתכם ב
            {money(STARTING_BALANCE)} וירטואליים להתחלה.
          </p>
          <Link
            href="/login?callbackUrl=/invite"
            className="tap pressable mt-4 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
          >
            התחברות
          </Link>
        </section>
      )}

      <section className="card p-3.5 sm:p-5">
        <h2 className="mb-3 font-bold text-text-strong">איך זה עובד</h2>
        <ol className="grid gap-2 sm:grid-cols-3 sm:gap-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3 rounded-xl bg-surface-2 p-3">
              <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                {s.n}
              </span>
              <div>
                <div className="text-sm font-bold text-text-strong">{s.title}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-muted-2">
          הבונוס הוא בכסף וירטואלי בלבד, כמו כל היתרה באתר — אין לו שום ערך כספי ואי אפשר למשוך אותו. הוא נספר בנפרד
          מהרווח וההפסד שלכם, כדי שלוח המובילים ימשיך למדוד חיזוי ולא שיתופים. הזמנה עצמית או חשבון שכבר נרשם בעבר לא
          מזכים.
        </p>
      </section>
    </div>
  );
}
