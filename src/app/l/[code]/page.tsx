import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { countMembers, getLeagueByCode, getMembership } from "@/lib/leagues";
import { leaguePath, MAX_LEAGUE_MEMBERS } from "@/lib/social";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/config";
import { money } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { PostButton } from "@/components/PostButton";
import { shareCard } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * Where a league invite link lands.
 *
 * It is the one page that says anything about a league to someone who is not in it —
 * its name and how many people are inside, never the table itself. The board opens
 * only after joining, which is the difference between an invite and a leak.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const league = await getLeagueByCode(code);
  const title = league ? `הוזמנתם לליגה "${league.name}" ב${SITE_NAME}` : `הזמנה לליגה ב${SITE_NAME}`;
  const description = `${SITE_TAGLINE}. מצטרפים לליגה, מנחשים את הבחירות, ורואים מי מוביל בין החברים.`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    // one page per league code: never index them
    robots: { index: false, follow: true },
    ...shareCard({ title, description, path: leaguePath(code) }),
  };
}

export default async function LeagueInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [league, session] = await Promise.all([getLeagueByCode(code), auth()]);
  // a mistyped or deleted link is not a dead end — send the visitor to the board itself
  if (!league) redirect("/leagues");

  const userId = session?.user?.id;
  if (userId) {
    const membership = await getMembership(league.id, userId);
    if (membership?.status === "member") redirect(`/leagues/${league.id}`);
  }
  const members = await countMembers(league.id);
  const full = members >= MAX_LEAGUE_MEMBERS;

  return (
    <div className="mx-auto max-w-2xl space-y-5 sm:mt-6 sm:space-y-6">
      <section className="hero-dark relative overflow-hidden rounded-2xl border border-brand-deep sm:rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-l from-ink/90 via-brand-deep/70 to-brand-deep/20" />
        <div className="relative p-5 sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[13px] font-semibold text-white/85">
            🏆 הזמנה לליגה
          </span>
          <h1 className="mt-3 text-[25px] font-black leading-tight text-white sm:text-4xl">{league.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-lg">
            {members} {members === 1 ? "משתתף/ת" : "משתתפים"} מנחשים כאן את הבחירות אחד מול השני. מצטרפים, עונים על
            שאלות, והטבלה מראה מי מוביל, בכמה נקודות ובאיזה מקום.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {full ? (
              <span className="inline-flex items-center justify-center rounded-xl bg-white/10 px-5 py-3 font-semibold text-white/80">
                הליגה מלאה ({MAX_LEAGUE_MEMBERS} משתתפים)
              </span>
            ) : userId ? (
              <PostButton
                endpoint="/api/leagues"
                body={{ action: "join", code: league.code }}
                label="הצטרפות לליגה"
                pendingLabel="מצטרפים…"
                tone="primary"
                navigate
                className="px-5 py-3 text-base"
              />
            ) : (
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(leaguePath(league.code))}`}
                className="tap pressable inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft"
              >
                התחברות והצטרפות · {money(STARTING_BALANCE)}
              </Link>
            )}
            <Link
              href="/"
              className="tap pressable inline-flex items-center justify-center rounded-xl border border-white/35 bg-white/10 px-5 py-3 font-semibold text-white hover:bg-white/20"
            >
              קודם נסתכל על השאלות
            </Link>
          </div>
          <div className="mt-5 inline-flex">
            <Countdown />
          </div>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="font-bold text-text-strong">מה רואים בליגה?</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          את השם, את הניקוד הכולל, את הרווח/הפסד ואת מספר התשובות הפתוחות של כל משתתף/ת —{" "}
          <strong className="text-text">לא רואים על אילו שאלות מישהו ענה</strong>. לוח המובילים הכללי של האתר נשאר
          אנונימי לגמרי; ליגה היא החריג המכוון, בין אנשים שבחרו להיות באותה טבלה. אפשר לצאת מהליגה בכל רגע.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {SITE_NAME} הוא משחק ידע בנקודות משחק בלבד — אין כסף אמיתי, אין פרסים ואין תשלום. כל משתתף/ת מתחיל/ה עם{" "}
          {money(STARTING_BALANCE)}.
        </p>
        <Link href="/about" className="mt-3 inline-flex items-center py-1 text-sm text-accent-2 hover:underline">
          איך זה עובד בדיוק
        </Link>
      </section>
    </div>
  );
}
