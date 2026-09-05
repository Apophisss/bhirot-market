import Link from "next/link";
import type { Metadata } from "next";
import { listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { MarketCard } from "@/components/MarketCard";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ELECTION_DATE, SITE_NAME, SITE_TEAM } from "@/lib/config";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { daysUntil, money } from "@/lib/format";
import { shareCard } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * Paid-traffic landing page.
 *
 * Deliberately not in the sitemap and marked noindex: it is a variant of the
 * home page that exists to be linked from an ad, and letting Google index both
 * would split the ranking of the real one.
 */
const DESCRIPTION = `משחק חיזויים חינמי בכסף וירטואלי על בחירות 2026. ${money(STARTING_BALANCE)} וירטואליים למתחילים, בלי הימורים ובלי כסף אמיתי.`;

export const metadata: Metadata = {
  title: "נחשו מה יקרה בפוליטיקה הישראלית",
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  // noindex, but this is the page an ad links to and the one people forward: the
  // inherited card would name the home page instead of the pitch they are reading
  ...shareCard({ title: `נחשו מה יקרה בפוליטיקה הישראלית | ${SITE_NAME}`, description: DESCRIPTION, path: "/welcome" }),
};

/** The single destination every button on this page points at. */
const CTA = "/login?callbackUrl=%2Frapid";

export default async function WelcomePage() {
  const session = await auth();
  // someone who already has an account does not need the pitch
  if (session?.user) redirect("/rapid");

  await ensureSynced();
  const markets = (await listMarkets({ status: "open", sort: "trending", limit: 3 })).slice(0, 3);

  return (
    <div className="mx-auto max-w-4xl space-y-8 sm:space-y-12">
      <section className="hero-dark -mx-3 rounded-none px-5 py-9 text-white sm:mx-0 sm:rounded-card sm:px-10 sm:py-14">
        {/* The disclosure sits above the headline on purpose: it is the first thing
            an ad reviewer looks for, and the first thing a sceptical visitor asks. */}
        <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold sm:text-sm">
          <span>כסף וירטואלי בלבד</span>
          <span aria-hidden className="text-white/40">·</span>
          <span>ללא הימורים</span>
          <span aria-hidden className="text-white/40">·</span>
          <span>ללא תשלום</span>
        </p>

        <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">
          חושבים שאתם יודעים
          <br />
          מה יקרה בבחירות?
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-lg">
          {SITE_NAME} הוא שוק חיזויים על הפוליטיקה הישראלית. מקבלים {money(STARTING_BALANCE)} וירטואליים, עונים ״כן״ או ״לא״
          על שאלות שמתעדכנות כל שעה לפי החדשות, ומגלים אם קראתם את המפה טוב יותר מכולם.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={CTA}
            className="tap pressable inline-flex items-center justify-center rounded-xl bg-white px-7 py-4 text-base font-extrabold text-brand-deep shadow-lg hover:bg-white/90 sm:text-lg"
          >
            להתחיל לשחק — חינם
          </Link>
          <p className="text-sm text-white/70">התחברות בלחיצה עם Google. בלי אשראי, בלי טופס.</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Step n="1" title="עונים על שאלה">
          ״האם הכנסת תתפזר עד מרץ?״ — כן או לא. כל תשובה היא קנייה של מניות בכסף וירטואלי.
        </Step>
        <Step n="2" title="המחיר זז">
          המחיר הוא ההסתברות שהשוק נותן. אם קניתם צד זול והוא התברר כנכון — הרווחתם.
        </Step>
        <Step n="3" title="עולים בטבלה">
          {SITE_TEAM} מכריע כל שאלה לפי מקורות פומביים, והתיק שלכם מתעדכן.
        </Step>
      </section>

      {markets.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-black text-text-strong sm:text-2xl">שאלות פתוחות ממש עכשיו</h2>
            <p className="text-sm text-muted">{daysUntil(`${ELECTION_DATE}T00:00:00+03:00`)} ימים לבחירות</p>
          </div>
          {/* Real, current markets — a screenshot of the product beats any description of it. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {markets.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3 p-5 text-[15px] leading-relaxed text-text sm:p-6">
        <h2 className="text-lg font-bold text-text-strong">רגע, זה הימורים?</h2>
        <p>
          לא. המטבע באתר וירטואלי לחלוטין ואין לו שום שווי — אי אפשר להפקיד, אי אפשר למשוך, ואין פרס כספי למי שמנצח.
          זה משחק ידע על פוליטיקה, בדיוק כמו טוטו דמה בין חברים. השימוש מגיל 18 ומעלה.
        </p>
        <p className="text-sm text-muted">
          <Link href="/about" className="text-accent hover:underline">איך זה עובד</Link>
          {" · "}
          <Link href="/privacy" className="text-accent hover:underline">מדיניות פרטיות</Link>
          {" · "}
          <Link href="/terms" className="text-accent hover:underline">תנאי שימוש</Link>
        </p>
      </section>

      <section className="pb-4 text-center">
        <Link
          href={CTA}
          className="tap pressable inline-flex items-center justify-center rounded-xl bg-accent px-8 py-4 text-base font-extrabold text-white hover:bg-accent-2 sm:text-lg"
        >
          קבלו {money(STARTING_BALANCE)} וירטואליים והתחילו
        </Link>
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
