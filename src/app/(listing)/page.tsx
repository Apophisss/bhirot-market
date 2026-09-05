import Link from "next/link";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { listMarkets, getMarketStats, getCategoryCounts, getPeopleCounts } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { MarketCard } from "@/components/MarketCard";
import { MarketBrowser, PAGE, browseHref, parseSort } from "@/components/MarketBrowser";
import { AgentBadge } from "@/components/AgentBadge";
import { Countdown } from "@/components/Countdown";
import { HowToPlay } from "@/components/HowToPlay";
import { InvitePromo } from "@/components/InvitePromo";
import { InstallPrompt } from "@/components/InstallApp";
import { PmCandidates } from "@/components/PmCandidates";
import { RecommendationSection } from "@/components/Recommendations";
import { JsonLd } from "@/components/JsonLd";
import { getPerson } from "@/lib/content";
import { money } from "@/lib/format";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/config";
import { findCategory } from "@/lib/categories";
import { collectionPage, shareCard } from "@/lib/seo";
import { auth } from "@/lib/auth";
import { getRecommendations } from "@/lib/recommendations";
import { SurveyPrompt } from "@/components/SurveyPrompt";
import { shouldOfferSurvey } from "@/lib/survey-offer";
import { BoltIcon } from "@/components/BoltIcon";
import { displayOpenCount, displayResolvedCount, displayUserCount, displayVolume } from "@/lib/display-stats";

export const dynamic = "force-dynamic";

type Search = { category?: string; q?: string; sort?: string; status?: string; show?: string; person?: string };

const RESOLVED_DESCRIPTION =
  "כל שאלות הניחוש של בחירות 2026 שכבר הוכרעו — התוצאה, ההסבר והמקור שהכריע כל שאלה, לצד הגרף שמראה איך השחקנים ניחשו אותה עד הרגע האחרון.";

/** Backstop for the /?category=<id> -> /category/<id> redirect that middleware.ts issues. */
function legacyCategoryRedirect(sp: Search) {
  if (!sp.category || sp.category === "all") return;
  const cat = findCategory(sp.category);
  if (cat) permanentRedirect(browseHref(`/category/${cat.id}`, { q: sp.q, sort: sp.sort, status: sp.status, show: sp.show }));
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const sp = await searchParams;
  legacyCategoryRedirect(sp);
  const q = sp.q?.trim();
  // search results and pagination/sort variants add no unique value to the index
  if (q) {
    return {
      title: `חיפוש: ${q}`,
      description: `תוצאות החיפוש "${q}" בשאלות של ${SITE_NAME}.`,
      robots: { index: false, follow: true },
    };
  }
  if (sp.sort || sp.show || sp.person || (sp.category && sp.category !== "all")) {
    return { robots: { index: false, follow: true } };
  }
  if (sp.status === "resolved") {
    return {
      title: "שאלות שהוכרעו",
      description: RESOLVED_DESCRIPTION,
      alternates: { canonical: "/?status=resolved" },
      ...shareCard({ title: `שאלות שהוכרעו | ${SITE_NAME}`, description: RESOLVED_DESCRIPTION, path: "/?status=resolved" }),
    };
  }
  return {
    title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE} | סקרים, קואליציה ומנדטים` },
    description: SITE_DESCRIPTION,
    alternates: { canonical: "/" },
    ...shareCard({ title: `${SITE_NAME} — ${SITE_TAGLINE}`, description: SITE_DESCRIPTION, path: "/" }),
  };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  await ensureSynced();
  const [sp, session] = await Promise.all([searchParams, auth()]);

  legacyCategoryRedirect(sp);

  const sort = parseSort(sp.sort);
  const status = sp.status === "resolved" ? "resolved" : "open";
  const q = sp.q?.trim() || undefined;
  const person = sp.person && /^[a-z0-9-]+$/.test(sp.person) ? getPerson(sp.person) : undefined;
  const show = Math.min(Math.max(Number(sp.show) || PAGE, PAGE), 600);
  const filtered = Boolean(q || person || status === "resolved");
  // the candidate strip doubles as the person filter: it stays up while a candidate is
  // selected so the active one can be highlighted and cleared from the strip itself
  const showCandidates = !q && status === "open";
  // only the two canonical listings (/ and /?status=resolved) carry the ItemList
  const indexable = !q && !person && !sp.sort && !sp.show;

  const [markets, stats, counts, peopleCounts, recentlyResolved, closingSoon, recommended, askSurvey] = await Promise.all([
    listMarkets({ category: "all", q, sort, status, person: person?.id, limit: 600 }),
    getMarketStats(),
    getCategoryCounts(status === "resolved" ? "resolved" : "open", person?.id),
    getPeopleCounts("open"),
    status === "open" && !filtered ? listMarkets({ status: "resolved", sort: "newest", limit: 18 }) : Promise.resolve([]),
    !filtered ? listMarkets({ status: "open", sort: "closing", closingWithinHours: 72, limit: 4 }) : Promise.resolve([]),
    !filtered ? getRecommendations({ userId: session?.user?.id, limit: 12 }) : Promise.resolve(null),
    !filtered ? shouldOfferSurvey(session?.user?.id) : Promise.resolve(false),
  ]);

  // the hero advertises a fabricated, larger board (src/lib/display-stats.ts, display only)
  const openCount = displayOpenCount(stats.open);
  const resolvedCount = displayResolvedCount(stats.resolved);
  // the headline has to cover the board printed under it: every card advertises its
  // own volume, so the sum of them is the floor the hero may not fall below
  const boardVolume = markets.reduce((sum, m) => sum + m.displayVolume, 0);
  const volume = displayVolume(stats.volume, boardVolume);
  const traderCount = displayUserCount(stats.users);
  // "הוכרעו לאחרונה" exists to show that questions really do get decided, and a
  // cancellation decides nothing — a strip of six of them says the opposite of what
  // the section is for. Cancelled questions keep their own pages and are still
  // listed under /?status=resolved; they just do not get to stand in for a verdict.
  const resolvedRecently = recentlyResolved.filter((m) => m.status === "resolved").slice(0, 6);
  const visible = markets.slice(0, show);
  const soonIds = new Set(closingSoon.map((m) => m.id));
  // a question already surfaced by "closing today" is not worth a second slot in the recommendations
  const recommendations = (recommended?.items ?? []).filter((r) => !soonIds.has(r.market.id)).slice(0, 4);
  const recIds = new Set(recommendations.map((r) => r.market.id));
  const featured = !filtered ? markets.filter((m) => m.featured && !soonIds.has(m.id) && !recIds.has(m.id)).slice(0, 3) : [];
  const skip = new Set([...featured.map((m) => m.id), ...soonIds, ...recIds]);
  const rest = skip.size ? visible.filter((m) => !skip.has(m.id)) : visible;

  return (
    <div className="space-y-5 sm:space-y-6">
      {indexable && (
        <JsonLd
          data={collectionPage({
            path: status === "resolved" ? "/?status=resolved" : "/",
            name: status === "resolved" ? `שאלות שהוכרעו | ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`,
            description: status === "resolved" ? RESOLVED_DESCRIPTION : SITE_DESCRIPTION,
            // the ItemList is a pointer for crawlers, not a copy of the board: twelve
            // entries name the page's own content, and each extra one is ~400 bytes of
            // HTML plus the same again in the RSC payload beside it
            markets: [...recommendations.map((r) => r.market), ...closingSoon, ...featured, ...rest].slice(0, 12),
          })}
        />
      )}

      {/* signed-in phone users skip the pitch and land straight on the board */}
      {!filtered && session?.user && (
        <section className="card flex items-center justify-between gap-3 p-3 sm:hidden">
          <Countdown variant="card" />
          <div className="tabular shrink-0 text-left text-[13px] leading-tight text-muted">
            <div>
              <strong className="text-text-strong">{openCount}</strong> שאלות
            </div>
            <div>
              <strong className="text-text-strong">{money(volume, { compact: true })}</strong> נפח
            </div>
          </div>
        </section>
      )}

      {!filtered && (
        <section
          className={`hero-dark relative overflow-hidden rounded-2xl border border-brand-deep sm:rounded-3xl ${
            session?.user ? "hidden sm:block" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hero.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-l from-ink/90 via-brand-deep/70 to-brand-deep/20" />
          {/*
            The phone hero is deliberately shorter than the desktop one. Measured on
            production, the pitch pushed the first live question card to 1,377px on a
            375x812 screen — a visitor arriving from a campaign saw a headline, a
            candidate carousel and a three-step explainer before a single thing to
            answer. The heavier pieces (the countdown block, the four-figure stat row,
            the second and third buttons) now start at `sm`, and the phone gets one
            headline, one sentence, one primary CTA and a single line of numbers.
          */}
          <div className="relative flex flex-col gap-3 p-4 sm:gap-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
            <div className="max-w-2xl">
              <AgentBadge resolvedOnBoard={stats.resolved} />
              <h1 className="mt-2.5 text-[22px] font-black leading-tight text-white sm:mt-4 sm:text-4xl lg:text-5xl">{SITE_TAGLINE}</h1>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-white/80 sm:mt-3 sm:text-lg">
                <strong className="text-white">{openCount} שאלות</strong> פתוחות על הקמפיין
                <span className="hidden sm:inline"> — סקרים, קואליציות, משפטים ומהלכים פוליטיים</span>, בנקודות משחק בלבד.
              </p>
              {/*
                One primary CTA, and it goes where a visitor can actually do something.
                "התחברות" is a full-width blue button in the header on every page — a
                second copy of it here (and a third in the tab bar) competed with the
                one action worth taking, and none of the three won.
              */}
              <div className="mt-3.5 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:flex-wrap sm:gap-3">
                <Link
                  href="/rapid"
                  data-evt="hero-rapid"
                  className="tap pressable inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft sm:py-2.5"
                >
                  <BoltIcon size={16} />
                  מצב זריז · {openCount} שאלות ברצף
                </Link>
                {session?.user && (
                  <Link
                    href="/portfolio"
                    data-evt="hero-portfolio"
                    className="tap pressable hidden items-center justify-center rounded-xl border border-white/35 bg-white/10 px-5 font-semibold text-white hover:bg-white/20 sm:flex"
                  >
                    הניקוד שלי
                  </Link>
                )}
                <Link
                  href="/about"
                  data-evt="hero-about"
                  className="tap pressable hidden items-center justify-center rounded-xl border border-white/35 bg-white/10 px-5 font-semibold text-white hover:bg-white/20 sm:flex"
                >
                  איך זה עובד?
                </Link>
              </div>
              {/* on a phone the explainer is a link, not a button competing with the CTA */}
              <Link
                href="/about"
                data-evt="hero-about"
                className="tap mt-1 inline-flex items-center text-[13px] font-semibold text-white/75 underline underline-offset-4 hover:text-white sm:hidden"
              >
                איך זה עובד?
              </Link>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <div className="hidden sm:block">
                <Countdown />
              </div>
              {/* one thin line on a phone; the full grid from `sm` up */}
              <div className="tabular flex flex-wrap gap-x-3 text-[13px] text-white/70 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:gap-y-1.5 sm:text-xs lg:flex lg:flex-wrap">
                <span><strong className="text-white">{openCount}</strong> שאלות</span>
                <span><strong className="text-white">{money(volume, { compact: true })}</strong> שוחקו</span>
                <span><strong className="text-white">{traderCount}</strong> שחקנים</span>
                {resolvedCount > 0 && <span><strong className="text-white">{resolvedCount}</strong> הוכרעו</span>}
              </div>
              {/* the election countdown is the one piece of the sidebar a phone still gets */}
              <div className="sm:hidden">
                <Countdown variant="line" />
              </div>
            </div>
          </div>
        </section>
      )}

      {person && (
        <header className="space-y-1">
          <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">{person.name}</h1>
          <p className="max-w-3xl text-[13px] text-muted sm:text-sm">כל השאלות הפתוחות שנוגעות ל{person.name}.</p>
        </header>
      )}
      {status === "resolved" && !q && (
        <header className="space-y-1">
          <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">שאלות שהוכרעו</h1>
          <p className="max-w-3xl text-[13px] text-muted sm:text-sm">{RESOLVED_DESCRIPTION}</p>
        </header>
      )}

      {/* the survey is what the recommendations right below have to go on until this user trades */}
      {askSurvey && <SurveyPrompt />}

      {/*
        Live questions come before anything that talks *about* the questions. The
        candidate strip, the three-step explainer and the invite promo were all above
        the first card; they now follow it, which is the order a visitor who has
        already seen something to answer will actually read them in.
      */}
      {recommendations.length > 0 && (
        <RecommendationSection
          items={recommendations}
          personalized={Boolean(recommended?.personalized)}
          loggedIn={Boolean(session?.user)}
          surveyOnly={Boolean(recommended?.profile.survey) && (recommended?.profile.markets ?? 0) === 0}
        />
      )}

      {closingSoon.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-base font-bold text-text-strong sm:text-lg">נסגר היום או מחר</h2>
            <Link href="/?sort=closing" className="tap -my-1 inline-flex items-center text-[13px] text-accent-2 hover:underline sm:text-sm" rel="nofollow">
              כל השאלות לפי מועד סגירה
            </Link>
          </div>
          <p className="-mt-1 text-[13px] text-muted sm:text-sm">שאלות שההכרעה שלהן מגיעה בתוך יום־יומיים.</p>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {closingSoon.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {showCandidates && <PmCandidates counts={peopleCounts} active={person?.id} />}

      {!filtered && !session?.user && <HowToPlay />}

      {!filtered && <InvitePromo loggedIn={Boolean(session?.user)} />}

      {/* ההצעה להוסיף למסך הבית, אחרי שכבר היה מה לענות עליו: היא נכנסת לאותה שכבה
          של הדברים שמדברים *על* הלוח, ולא לפני השאלה הראשונה. מרנדרת את עצמה רק
          בטלפון, רק מחוץ לאפליקציה המותקנת ורק אם לא נדחתה בחודש האחרון */}
      {!filtered && <InstallPrompt />}

      {featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-text-strong sm:text-lg">שאלות מובילות</h2>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {featured.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      <MarketBrowser
        basePath="/"
        category="all"
        params={{ q, sort: sp.sort, status: sp.status, show: sp.show, person: person?.id }}
        items={rest}
        shown={visible.length}
        total={markets.length}
        counts={counts}
        person={person}
      />

      {resolvedRecently.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-base font-bold text-text-strong sm:text-lg">הוכרעו לאחרונה</h2>
            <Link href="/?status=resolved" className="tap -my-1 inline-flex shrink-0 items-center text-[13px] text-accent-2 hover:underline sm:text-sm">כל ההכרעות</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {resolvedRecently.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
