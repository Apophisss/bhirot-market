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
import { PmCandidates } from "@/components/PmCandidates";
import { JsonLd } from "@/components/JsonLd";
import { getPerson } from "@/lib/content";
import { money } from "@/lib/format";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/config";
import { findCategory } from "@/lib/categories";
import { collectionPage } from "@/lib/seo";
import { auth } from "@/lib/auth";
import { BoltIcon } from "@/components/BoltIcon";

export const dynamic = "force-dynamic";

type Search = { category?: string; q?: string; sort?: string; status?: string; show?: string; person?: string };

const RESOLVED_DESCRIPTION =
  "כל שוקי החיזוי של בחירות 2026 שכבר הוכרעו — התוצאה, ההסבר והמקור שהכריע כל שאלה, לצד הגרף שמראה איך השוק תמחר אותה עד הרגע האחרון.";

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
      description: `תוצאות החיפוש "${q}" בשוקי החיזוי של ${SITE_NAME}.`,
      robots: { index: false, follow: true },
    };
  }
  if (sp.sort || sp.show || sp.person || (sp.category && sp.category !== "all")) {
    return { robots: { index: false, follow: true } };
  }
  if (sp.status === "resolved") {
    return {
      title: "שווקים שהוכרעו",
      description: RESOLVED_DESCRIPTION,
      alternates: { canonical: "/?status=resolved" },
      openGraph: { url: "/?status=resolved", title: `שווקים שהוכרעו | ${SITE_NAME}`, description: RESOLVED_DESCRIPTION },
    };
  }
  return {
    title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE} | סקרים, קואליציה ומנדטים` },
    description: SITE_DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: { url: "/" },
  };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  await ensureSynced();
  const sp = await searchParams;

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

  const [markets, stats, counts, peopleCounts, session, recentlyResolved, closingSoon] = await Promise.all([
    listMarkets({ category: "all", q, sort, status, person: person?.id, limit: 600 }),
    getMarketStats(),
    getCategoryCounts(status === "resolved" ? "resolved" : "open", person?.id),
    getPeopleCounts("open"),
    auth(),
    status === "open" && !filtered ? listMarkets({ status: "resolved", sort: "newest", limit: 6 }) : Promise.resolve([]),
    !filtered ? listMarkets({ status: "open", sort: "closing", closingWithinHours: 72, limit: 6 }) : Promise.resolve([]),
  ]);

  const visible = markets.slice(0, show);
  const soonIds = new Set(closingSoon.map((m) => m.id));
  const featured = !filtered ? markets.filter((m) => m.featured && !soonIds.has(m.id)).slice(0, 3) : [];
  const skip = new Set([...featured.map((m) => m.id), ...soonIds]);
  const rest = skip.size ? visible.filter((m) => !skip.has(m.id)) : visible;

  return (
    <div className="space-y-6">
      {indexable && (
        <JsonLd
          data={collectionPage({
            path: status === "resolved" ? "/?status=resolved" : "/",
            name: status === "resolved" ? `שווקים שהוכרעו | ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`,
            description: status === "resolved" ? RESOLVED_DESCRIPTION : SITE_DESCRIPTION,
            markets: [...closingSoon, ...featured, ...rest].slice(0, 30),
          })}
        />
      )}

      {!filtered && (
        <section className="hero-dark relative overflow-hidden rounded-3xl border border-brand-deep">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hero.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-l from-ink/90 via-brand-deep/70 to-brand-deep/20" />
          <div className="relative flex flex-col gap-5 p-6 sm:p-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <AgentBadge />
              <h1 className="mt-4 text-3xl font-black leading-tight text-white sm:text-5xl">{SITE_TAGLINE}</h1>
              <p className="mt-3 max-w-xl text-base text-white/75 sm:text-lg">
                סקרים, קואליציות, משפטים ומהלכים פוליטיים. כרגע פתוחות
                {" "}
                <strong className="text-white">{stats.open} שאלות</strong> על הקמפיין, למסחר בכסף וירטואלי בלבד.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/rapid" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft">
                  <BoltIcon size={16} />
                  מצב זריז · {stats.open} שאלות ברצף
                </Link>
                {session?.user ? (
                  <Link href="/portfolio" className="rounded-xl border border-white/35 bg-white/10 px-5 py-2.5 font-semibold text-white hover:bg-white/20">
                    לתיק שלי
                  </Link>
                ) : (
                  <Link href="/login" className="rounded-xl border border-white/35 bg-white/10 px-5 py-2.5 font-semibold text-white hover:bg-white/20">
                    התחברות וקבלת ₪10,000 וירטואליים
                  </Link>
                )}
                <Link href="/about" className="rounded-xl border border-white/35 bg-white/10 px-5 py-2.5 font-semibold text-white hover:bg-white/20">
                  איך זה עובד?
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Countdown />
              <div className="flex flex-wrap gap-4 text-xs text-white/70">
                <span><strong className="tabular text-white">{stats.open}</strong> שווקים פתוחים</span>
                <span><strong className="tabular text-white">{stats.resolved}</strong> הוכרעו</span>
                <span><strong className="tabular text-white">{money(stats.volume, { compact: true })}</strong> נפח</span>
                <span><strong className="tabular text-white">{stats.users}</strong> סוחרים</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {showCandidates && <PmCandidates counts={peopleCounts} active={person?.id} />}
      {person && (
        <header className="space-y-1">
          <h1 className="text-2xl font-extrabold text-text-strong">{person.name}</h1>
          <p className="max-w-3xl text-sm text-muted">כל שוקי החיזוי הפתוחים שנוגעים ל{person.name}.</p>
        </header>
      )}
      {status === "resolved" && !q && (
        <header className="space-y-1">
          <h1 className="text-2xl font-extrabold text-text-strong">שווקים שהוכרעו</h1>
          <p className="max-w-3xl text-sm text-muted">{RESOLVED_DESCRIPTION}</p>
        </header>
      )}

      {!filtered && !session?.user && <HowToPlay />}

      {closingSoon.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-text-strong">נסגר היום או מחר</h2>
            <Link href="/?sort=closing" className="text-sm text-accent-2 hover:underline" rel="nofollow">
              כל השאלות לפי מועד סגירה
            </Link>
          </div>
          <p className="-mt-1 text-sm text-muted">שאלות שההכרעה שלהן מגיעה בתוך יום־יומיים.</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {closingSoon.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-text-strong">שאלות מובילות</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      {recentlyResolved.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-text-strong">הוכרעו לאחרונה</h2>
            <Link href="/?status=resolved" className="text-sm text-accent-2 hover:underline">כל ההכרעות</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recentlyResolved.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
