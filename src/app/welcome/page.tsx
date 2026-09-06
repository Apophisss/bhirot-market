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
import { headers } from "next/headers";
import { inAppBrowser, recordEvents, requestContext } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";
import { shareCard } from "@/lib/seo";
import { displayOpenCount } from "@/lib/display-stats";
import { GUEST_LIMIT } from "@/lib/rapid-guest";
import { BoltIcon } from "@/components/BoltIcon";
import { WELCOME_SOON_HOURS, pickWelcomeQuestions } from "@/lib/welcome-pick";
import type { MarketView } from "@/lib/markets";

export const dynamic = "force-dynamic";

/**
 * Paid-traffic landing page.
 *
 * Deliberately not in the sitemap and marked noindex: it is a variant of the
 * home page that exists to be linked from an ad, and letting Google index both
 * would split the ranking of the real one.
 *
 * What the page is shaped around, in one sentence: the ad shows a question card
 * with a green כן and a red לא, so the first thing on the screen after the click
 * is that card, live, and it answers back when tapped.
 *
 * Measured on the version this replaces (390×664 viewport, the campaign's own
 * traffic 89% bounce with 34s on page): the first thing a visitor could answer sat
 * at y=918, below a login button, a disclosure pill, a three-line headline, a
 * countdown, a paragraph repeating the disclosure, and a CTA. "נקודות משחק בלבד"
 * appeared four times on the page. People read it — 34 seconds is reading — and
 * left without touching anything: 4 card taps out of 70 visitors, and the CTA
 * buttons carried no click id at all, so nobody could tell whether they were
 * tapped. Now the disclosure appears once above the fold (the ad reviewer's
 * requirement is that it be visible, not that it be repeated), and the card is
 * the second thing on the page.
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
 * The single destination every button on this page points at.
 *
 * The deck, not the sign-in screen. It used to be `/login`: an ad promising a free
 * knowledge game, and one click later a stranger being asked for a Google account
 * before a single question had been asked of them. The free run is `GUEST_LIMIT`
 * questions and it needs no account at all (`src/lib/rapid-guest.ts`), so the button
 * that says "להתחיל לשחק" now starts the game. The account is asked for where it
 * means something — at the end of the run, on the screen that lists what it keeps.
 */
const CTA = "/rapid";
/** the one link on the page that does not start the run — for someone who already has an account */
const LOGIN = "/login?callbackUrl=%2Frapid";

/**
 * Below this, the number of open questions is not a sign of scale — it is a
 * confession. A small number is worse than no number, so the board's size is
 * quoted only once it argues for itself.
 */
const MIN_QUESTIONS_TO_QUOTE = 40;

/** how many live cards the page carries: one in the hero, the rest under it */
const CARDS = 3;

type Search = { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; gclid?: string; gbraid?: string; wbraid?: string };

/**
 * The click, counted on the server.
 *
 * The browser's pageview is sent from an effect after hydration, so an ad tap
 * abandoned before the JavaScript ran — on a mid-range phone over cellular that is
 * a two-second window, and a content blocker that swallows the collector makes it
 * permanent — never existed in the log. This row is written while the page is
 * rendered, from the same request headers the collector would have hashed, so the
 * paid funnel can print landings next to measured sessions and the gap between
 * them is the loss nothing else can see. No session id: none exists yet.
 */
async function recordLanding(sp: Search) {
  const paid = Boolean(sp.utm_medium || sp.gclid || sp.gbraid || sp.wbraid);
  if (!paid) return;
  try {
    const head = await headers();
    const ctx = requestContext(new Request("http://internal/welcome", { headers: head }));
    const ua = head.get("user-agent") ?? "";
    await recordEvents(
      [
        {
          name: EVENTS.landing,
          path: "/welcome",
          source: sp.utm_source ?? "google",
          medium: sp.utm_medium ?? "cpc",
          campaign: sp.utm_campaign ?? "",
          // This row is written before a line of JavaScript has run, so for a visitor
          // who leaves during the load it is the only place they are measured at all —
          // which makes it the only place these two can be recorded for them. An
          // in-app browser is exactly the visitor Google's sign-in may refuse later,
          // and the language says whether the targeting is reaching Hebrew speakers.
          props: {
            content: (sp.utm_content ?? "").slice(0, 60),
            webview: inAppBrowser(ua) ? 1 : 0,
            lang: (head.get("accept-language") ?? "").slice(0, 2).toLowerCase(),
          },
        },
      ],
      ctx,
    );
  } catch {
    // measurement must never fail the page
  }
}

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  // someone who already has an account does not need the pitch
  if (session?.user) redirect("/rapid");
  await recordLanding(sp);

  await ensureSynced();
  const [trending, closingSoon, counts] = await Promise.all([
    listMarkets({ status: "open", sort: "trending", limit: CARDS + 1 }),
    // the hero card's own pool: what is decided within the window, soonest first —
    // see src/lib/welcome-pick.ts for why the page no longer opens with "trending"
    listMarkets({ status: "open", sort: "closing", closingWithinHours: WELCOME_SOON_HOURS, limit: 24 }),
    getCategoryCounts("open"),
  ]);
  const byId = new Map<string, MarketView>([...trending, ...closingSoon].map((m) => [m.id, m]));
  const candidate = (m: MarketView) => ({ id: m.id, title: m.title, probability: m.probability, closesAt: m.closesAt.getTime() });
  const picked = pickWelcomeQuestions(closingSoon.map(candidate), trending.map(candidate), { count: CARDS });
  const chosen = [picked.hero, ...picked.rest].flatMap((c) => (c && byId.has(c.id) ? [byId.get(c.id)!] : []));
  const questions: WelcomeQuestion[] = chosen.map((m) => {
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
      closesAt: m.closesAt.getTime(),
    };
  });
  const [first, ...rest] = questions;
  // the same number the home page and the category filter print — see displayOpenCount
  const openCount = displayOpenCount(counts.all ?? 0);
  const days = daysUntil(`${ELECTION_DATE}T00:00:00+03:00`);

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-10">
      {/*
        The hero is the ad, continued: the pitch line above a live question card, on
        the same dark ground the creatives use. Everything that used to sit between
        the headline and the first card — the countdown, a paragraph, a CTA button, a
        sub-line about registration — now comes after the card or not at all. On a
        390×664 phone the two answer buttons land around y≈430, inside the first screen.
      */}
      <section className="hero-dark -mx-3 rounded-none px-4 pb-5 pt-5 text-white sm:mx-0 sm:rounded-card sm:px-10 sm:pb-10 sm:pt-8">
        {/* The disclosure stays above the headline: it is the first thing an ad
            reviewer looks for and the first thing a sceptical visitor asks. Once,
            on one line — the page below no longer repeats it. */}
        <p className="inline-flex flex-wrap items-center gap-x-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold leading-tight sm:text-sm">
          <span>נקודות משחק בלבד</span>
          <span aria-hidden className="text-white/60">·</span>
          <span>אין כסף אמיתי</span>
          <span aria-hidden className="text-white/60">·</span>
          <span>אין פרסים ואין תשלום</span>
        </p>

        {/* The headline is the one Google's asset review let through (commits 9d2fc29,
            d96d127, ded7faf): a question about knowledge. Three framings were rejected
            asset by asset and must stay off this page — the outcome of a future event
            ("מה יקרה"), an opening balance, and yes/no about what will happen. */}
        <h1 className="mt-3 text-[26px] font-black leading-tight sm:text-5xl">
          משחק ידע חינם: כמה טוב אתם מכירים את הפוליטיקה הישראלית?
        </h1>
        {/* one line, and it is an instruction rather than a description: the card
            under it is the thing to do, and this line says what the tap produces.
            "איפה הלוח עומד", not "מה השחקנים חושבים": on a question nobody has
            answered yet the meter is the board's opening estimate. */}
        <p className="mt-2 text-[15px] leading-snug text-white/85 sm:mt-3 sm:text-lg">
          ענו כן או לא — בלי הרשמה. המד מראה איפה הלוח עומד עכשיו, ותכף תראו כמה נקודות תקבלו אם צדקתם.
        </p>

        {first ? (
          <div className="mt-4 sm:mt-6 sm:max-w-md">
            {/* A real, current question that answers back — a static card is a
                screenshot, a card that responds is a demonstration. The answer starts
                the free run and hands over to the deck (see WelcomeQuestions). */}
            <WelcomeQuestions questions={[first]} variant="hero" />
          </div>
        ) : (
          <Link
            href={CTA}
            data-evt="welcome-start"
            className="tap pressable mt-5 inline-flex items-center justify-center rounded-xl bg-white px-7 py-4 text-base font-extrabold text-brand-deep shadow-lg hover:bg-white/90 sm:text-lg"
          >
            להתחיל לשחק — בלי הרשמה
          </Link>
        )}

        {/* no opening balance here on purpose — it is one of the patterns the ad review
            rejected on this page; the sign-in screen says it, where it is true */}
        <p className="mt-3 text-[13px] text-white/70 sm:text-sm">
          {GUEST_LIMIT} שאלות בלי חשבון, והתשובות נשמרות
          {days > 0 && (
            <>
              {" · "}
              <span className="tabular font-bold text-white">{days}</span> ימים לבחירות
            </>
          )}
        </p>
      </section>

      {rest.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-black text-text-strong sm:text-2xl">
              {rest.length === 1 ? "עוד שאלה פתוחה" : "עוד שתי שאלות פתוחות"}
            </h2>
            {/* A new Israeli site asking for a Google account meets a wall of distrust, and
                one honest number is the cheapest answer to it — but only while it is a
                number worth quoting. See MIN_QUESTIONS_TO_QUOTE. */}
            {openCount >= MIN_QUESTIONS_TO_QUOTE && (
              <p className="text-sm text-muted">
                <span className="tabular font-bold text-text">{openCount}</span> שאלות פתוחות כרגע
              </p>
            )}
          </div>
          <WelcomeQuestions questions={rest} />
        </section>
      )}

      {/* The way into the rest of the board, for someone who scrolled past the cards
          without tapping: the same destination the cards hand over to. */}
      <section className="text-center">
        <Link
          href={CTA}
          data-evt="welcome-start"
          className="tap pressable inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-7 py-3.5 text-base font-extrabold text-white shadow-md shadow-accent/25 hover:bg-accent-2 sm:text-lg"
        >
          <BoltIcon size={16} />
          לשאלה הבאה
        </Link>
        <p className="mt-2 text-sm text-muted">
          שאלה אחרי שאלה. {GUEST_LIMIT} הראשונות בלי חשבון; אחר כך הרשמה חינם, בלחיצה אחת עם Google.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Step n="1" title="עונים כן או לא">
          על כל תשובה שמים {money(RAPID_DEFAULT_STAKE)} נקודות משחק, ומקבלים יותר אם צדקתם.
        </Step>
        <Step n="2" title="פחות מסכימים איתכם = יותר נקודות">
          המד מראה כמה מהשחקנים בצד שלכם. ככל שהוא נמוך יותר, תשובה נכונה שווה יותר.
        </Step>
        <Step n="3" title="עולים בטבלה">
          {SITE_TEAM} מכריע כל שאלה לפי מקורות פומביים, והניקוד שלכם מתעדכן.
        </Step>
      </section>

      <section className="card space-y-3 p-5 text-[15px] leading-relaxed text-text sm:p-6">
        <h2 className="text-lg font-bold text-text-strong">רגע, משחקים כאן על כסף?</h2>
        {/* the answer without the vocabulary of the thing being denied: no deposits,
            withdrawals or credit cards in a paragraph whose point is that none exist */}
        <p>
          לא. הנקודות הן ניקוד במשחק, כמו בטריוויה — אי אפשר לקנות אותן, אי אפשר לפדות אותן, ואין פרסים. עונים כן או
          לא, וצוברים נקודות אם צדקתם.
        </p>
        <p className="text-sm text-muted">
          <Link href="/about" data-evt="welcome-how" className="text-accent hover:underline">איך זה עובד</Link>
          {" · "}
          <Link href="/privacy" className="text-accent hover:underline">מדיניות פרטיות</Link>
          {" · "}
          <Link href="/terms" className="text-accent hover:underline">תנאי שימוש</Link>
          {" · "}
          <span>מגיל 18</span>
        </p>
      </section>

      <section className="pb-4 text-center">
        <Link
          href={CTA}
          data-evt="welcome-start-end"
          className="tap pressable inline-flex items-center justify-center rounded-xl border border-border-2 px-7 py-3.5 text-base font-bold text-text-strong hover:bg-surface-2"
        >
          לבדוק כמה אתם מכירים
        </Link>
        {/* The whole page is written at someone who has never been here, and everything
            on it leads into the free run. Somebody who already has an account is not
            being pitched — they are signed out on this browser, and the run they are
            being offered is one they have already had. */}
        <p className="mt-3 text-sm text-muted-2">
          כבר יש לכם חשבון?{" "}
          <Link href={LOGIN} data-evt="welcome-login" className="font-semibold text-accent hover:underline">
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
