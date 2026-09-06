import Link from "next/link";
import type { Metadata } from "next";
import { getCategoryCounts, listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { WelcomeQuestions, type WelcomeQuestion } from "@/components/WelcomeQuestions";
import { getCategory } from "@/lib/categories";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ELECTION_DATE, SITE_NAME, SITE_TEAM } from "@/lib/config";
import { daysUntil, money } from "@/lib/format";
import { RAPID_DEFAULT_STAKE } from "@/lib/rapid";
import { GUEST_LIMIT } from "@/lib/rapid-guest";
import { shareCard } from "@/lib/seo";
import { displayOpenCount } from "@/lib/display-stats";

export const dynamic = "force-dynamic";

/**
 * Paid-traffic landing page.
 *
 * Deliberately not in the sitemap and marked noindex: it is a variant of the
 * home page that exists to be linked from an ad, and letting Google index both
 * would split the ranking of the real one.
 */
const DESCRIPTION = "משחק ידע חינמי על הפוליטיקה הישראלית — בנקודות משחק בלבד. אין כסף אמיתי, אין פרסים ואין תשלום.";

export const metadata: Metadata = {
  title: "משחק ידע על הפוליטיקה הישראלית",
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  // noindex, but this is the page an ad links to and the one people forward: the
  // inherited card would name the home page instead of the pitch they are reading
  ...shareCard({ title: `משחק ידע על הפוליטיקה הישראלית | ${SITE_NAME}`, description: DESCRIPTION, path: "/welcome" }),
};

/**
 * The single destination every button on this page points at: the deck itself.
 *
 * It used to be `/login?callbackUrl=/rapid` — an ad promising a free game, and a
 * Google account demanded before a single question had been seen. The deck has let
 * a visitor answer without an account for a while now (`GUEST_LIMIT` answers, kept
 * in the browser and redeemed on the way back from Google — see `rapid-guest.ts`),
 * so the sign-in is asked where it means something: after the free run, in order to
 * keep answers that already exist.
 */
const CTA = "/rapid";
/** for the minority who already have an account and just want back in */
const LOGIN = "/login?callbackUrl=%2Frapid";

/**
 * Below this, the number of open questions is not a sign of scale — it is a
 * confession. A small number is worse than no number, so the board's size is
 * quoted only once it argues for itself.
 */
const MIN_QUESTIONS_TO_QUOTE = 40;

export default async function WelcomePage() {
  const session = await auth();
  // someone who already has an account does not need the pitch
  if (session?.user) redirect("/rapid");

  await ensureSynced();
  const [markets, counts] = await Promise.all([
    listMarkets({ status: "open", sort: "trending", limit: 3 }),
    getCategoryCounts("open"),
  ]);
  const questions: WelcomeQuestion[] = markets.slice(0, 3).map((m) => {
    const cat = getCategory(m.category);
    return {
      id: m.id,
      title: m.title,
      probability: m.probability,
      qYes: m.qYes,
      qNo: m.qNo,
      liquidity: m.liquidity,
      image: m.image,
      fallbackImage: cat.cover,
      personName: m.personName ?? null,
      categoryLabel: m.categoryLabel,
      categoryAccent: cat.accent,
      categoryAccentDark: cat.accentDark,
    };
  });
  // the same number the home page and the category filter print — see displayOpenCount
  const openCount = displayOpenCount(counts.all ?? 0);
  const days = daysUntil(`${ELECTION_DATE}T00:00:00+03:00`);

  return (
    <div className="mx-auto max-w-4xl space-y-8 sm:space-y-12">
      <section className="hero-dark -mx-3 rounded-none px-5 py-9 text-white sm:mx-0 sm:rounded-card sm:px-10 sm:py-14">
        {/* The disclosure sits above the headline on purpose: it is the first thing
            an ad reviewer looks for, and the first thing a sceptical visitor asks. */}
        <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold sm:text-sm">
          <span>נקודות משחק בלבד</span>
          <span aria-hidden className="text-white/60">·</span>
          <span>אין כסף אמיתי</span>
          <span aria-hidden className="text-white/60">·</span>
          <span>אין פרסים ואין תשלום</span>
        </p>

        <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">
          משחק ידע חינם:
          <br />
          כמה טוב אתם מכירים את הפוליטיקה הישראלית?
        </h1>
        {/* The one piece of urgency on this page that is not invented: there is a real
            election on a real date. It used to sit in small grey type halfway down the
            page; next to the headline it is the reason to answer today. */}
        {days > 0 && (
          <p className="mt-3 inline-flex items-baseline gap-2 text-white/90">
            <span className="tabular text-2xl font-black text-white sm:text-3xl">{days}</span>
            <span className="text-sm font-semibold sm:text-base">ימים ליום הבחירות</span>
          </p>
        )}
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-lg">
          {SITE_NAME} הוא משחק ידע על הפוליטיקה הישראלית — בנקודות משחק בלבד. אין כסף אמיתי, אין פרסים
          ואין תשלום. עונים על שאלות, צוברים נקודות על תשובות נכונות, ומגלים אם קראתם את המפה טוב יותר מכולם.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={CTA}
            className="tap pressable inline-flex items-center justify-center rounded-xl bg-white px-7 py-4 text-base font-extrabold text-brand-deep shadow-lg hover:bg-white/90 sm:text-lg"
          >
            להתחיל לשחק — בלי הרשמה
          </Link>
          <p className="text-sm text-white/70">
            {GUEST_LIMIT} השאלות הראשונות בלי חשבון בכלל. אחר כך התחברות בלחיצה עם Google — בלי אשראי, בלי טופס.
          </p>
        </div>
      </section>

      {questions.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-black text-text-strong sm:text-2xl">ענו על שאלה אחת עכשיו</h2>
            {/* A new Israeli site asking for a Google account meets a wall of distrust, and
                one honest number is the cheapest answer to it — but only while it is a
                number worth quoting. See MIN_QUESTIONS_TO_QUOTE. */}
            {openCount >= MIN_QUESTIONS_TO_QUOTE && (
              <p className="text-sm text-muted">
                <span className="tabular font-bold text-text">{openCount}</span> שאלות פתוחות כרגע
              </p>
            )}
          </div>
          <p className="text-sm leading-relaxed text-muted">
            שאלות אמיתיות מהלוח, עם מד הביטחון של השחקנים בהן ברגע זה. עונים כאן בלי חשבון וממשיכים ישר למצב זריז —
            התשובה נשמרת, והיא תיכנס לניקוד ב-{money(RAPID_DEFAULT_STAKE)} ברגע שתתחברו.
          </p>
          {/* Real, current markets that answer back — a static card is a screenshot,
              a card that responds is a demonstration. */}
          <WelcomeQuestions questions={questions} />
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Step n="1" title="עונים על שאלה">
          בוחרים שאלה מהלוח ועונים. כל תשובה עולה נקודות משחק, לפי כמה היא בטוחה.
        </Step>
        <Step n="2" title="המד זז">
          תשובה זולה שווה יותר נקודות אם צדקתם. ככל שפחות שחקנים בחרו את הצד שלכם — כך המד נמוך יותר והתשובה משתלמת יותר.
        </Step>
        <Step n="3" title="עולים בטבלה">
          {SITE_TEAM} מכריע כל שאלה לפי מקורות פומביים, והניקוד שלכם מתעדכן.
        </Step>
      </section>

      <section className="card space-y-3 p-5 text-[15px] leading-relaxed text-text sm:p-6">
        <h2 className="text-lg font-bold text-text-strong">רגע, משחקים כאן על כסף?</h2>
        <p>
          לא. הניקוד באתר הוא נקודות משחק בלבד ואין לו שום שווי — אין מה להפקיד, אין מה למשוך, ואין פרס למי שמנצח.
          זה משחק ידע על פוליטיקה: עונים כן או לא, וצוברים נקודות אם צדקתם. השימוש מגיל 18 ומעלה.
        </p>
        <p className="text-sm text-muted">
          <Link href="/about" className="text-accent hover:underline">איך זה עובד</Link>
          {" · "}
          <Link href="/privacy" className="text-accent hover:underline">מדיניות פרטיות</Link>
          {" · "}
          <Link href="/terms" className="text-accent hover:underline">תנאי שימוש</Link>
        </p>
      </section>

      <section className="space-y-2.5 pb-4 text-center">
        <Link
          href={CTA}
          className="tap pressable inline-flex items-center justify-center rounded-xl bg-accent px-8 py-4 text-base font-extrabold text-white hover:bg-accent-2 sm:text-lg"
        >
          לבדוק כמה אתם מכירים — בלי הרשמה
        </Link>
        {/* The one place on the page that still leads straight to Google: someone who
            already has an account is not here to be pitched, and should not have to
            answer four questions to get back to their own score. */}
        <p className="text-sm text-muted">
          כבר יש לכם חשבון?{" "}
          <Link href={LOGIN} className="font-semibold text-accent hover:underline">
            התחברות
          </Link>
        </p>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-sm font-black text-accent-2">
        {n}
      </span>
      <h3 className="mt-2.5 font-bold text-text-strong">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}
