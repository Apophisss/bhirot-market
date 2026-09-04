import Link from "next/link";
import { listMarkets, getMarketStats, getCategoryCounts, getPeopleCounts, type MarketSort } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { MarketCard } from "@/components/MarketCard";
import { CategoryTabs } from "@/components/CategoryTabs";
import { AgentBadge } from "@/components/AgentBadge";
import { Countdown } from "@/components/Countdown";
import { HowToPlay } from "@/components/HowToPlay";
import { PmCandidates } from "@/components/PmCandidates";
import { getPerson } from "@/lib/content";
import { money } from "@/lib/format";
import { SITE_TAGLINE } from "@/lib/config";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Search = { category?: string; q?: string; sort?: string; status?: string; show?: string; person?: string };

const SORTS: { id: MarketSort; label: string }[] = [
  { id: "trending", label: "חם" },
  { id: "newest", label: "חדש" },
  { id: "closing", label: "נסגר בקרוב" },
  { id: "volume", label: "נפח" },
];

const PAGE = 36;

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  await ensureSynced();
  const sp = await searchParams;
  const category = sp.category ?? "all";
  const sort = (SORTS.find((s) => s.id === sp.sort)?.id ?? "trending") as MarketSort;
  const status = sp.status === "resolved" ? "resolved" : "open";
  const q = sp.q?.trim() || undefined;
  const person = sp.person && /^[a-z0-9-]+$/.test(sp.person) ? getPerson(sp.person) : undefined;
  const show = Math.min(Math.max(Number(sp.show) || PAGE, PAGE), 600);
  const filtered = Boolean(q || person || category !== "all" || status === "resolved");
  // the candidate strip doubles as the person filter, so keep it up while it is the only filter
  const showCandidates = !q && category === "all" && status === "open";

  const [markets, stats, counts, peopleCounts, session, recentlyResolved, closingSoon] = await Promise.all([
    listMarkets({ category, q, sort, status, person: person?.id, limit: 600 }),
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

  const link = (patch: Partial<Search>) => {
    const next = { ...sp, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (!v) continue;
      if (k === "category" && v === "all") continue;
      if (k === "status" && v === "open") continue;
      usp.set(k, String(v));
    }
    const s = usp.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="space-y-6">
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
                סקרים, קואליציות, משפטים, תביעות ומהלכים פוליטיים — מי צודק, השוק או הפרשנים? סחרו בכסף וירטואלי על
                {" "}
                <strong className="text-white">{stats.open} השאלות</strong> החדות של הקמפיין, שמתעדכנות כל שעה.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {session?.user ? (
                  <Link href="/portfolio" className="rounded-xl bg-white px-5 py-2.5 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft">
                    לתיק שלי
                  </Link>
                ) : (
                  <Link href="/login" className="rounded-xl bg-white px-5 py-2.5 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft">
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

      {!filtered && !session?.user && <HowToPlay />}

      {closingSoon.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-text-strong">⏱️ נסגר היום או מחר</h2>
            <Link href="/?sort=closing" className="text-sm text-accent-2 hover:underline">
              כל השאלות לפי מועד סגירה
            </Link>
          </div>
          <p className="-mt-1 text-sm text-muted">שאלות שההכרעה שלהן מגיעה תוך שעות — המקום הכי טוב להתחיל לשחק בו.</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {closingSoon.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-text-strong">🔥 השאלות הבוערות</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featured.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <CategoryTabs active={category} params={{ q, sort: sp.sort, status: sp.status, person: person?.id }} counts={counts} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-sm">
            <Link href={link({ status: "open", show: undefined })} className={`rounded-lg px-3 py-1.5 font-semibold ${status === "open" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}>
              פתוחים
            </Link>
            <Link href={link({ status: "resolved", show: undefined })} className={`rounded-lg px-3 py-1.5 font-semibold ${status === "resolved" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}>
              הוכרעו
            </Link>
            {q && (
              <span className="ms-2 flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted">
                חיפוש: <strong className="text-text">{q}</strong>
                <Link href={link({ q: undefined })} className="ms-1 text-muted-2 hover:text-no" aria-label="נקה חיפוש">✕</Link>
              </span>
            )}
            {person && (
              <span className="ms-2 flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted">
                מועמד: <strong className="text-text">{person.name}</strong>
                <Link href={link({ person: undefined })} className="ms-1 text-muted-2 hover:text-no" aria-label="נקה סינון מועמד">✕</Link>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="me-1 text-muted-2">מיון:</span>
            {SORTS.map((s) => (
              <Link key={s.id} href={link({ sort: s.id })} className={`rounded-md px-2 py-1 font-semibold ${sort === s.id ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}>
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {rest.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rest.map((m) => (
                <MarketCard key={m.id} m={m} />
              ))}
            </div>
            {markets.length > show && (
              <div className="flex flex-col items-center gap-1 pt-2">
                <Link
                  href={link({ show: String(show + PAGE) })}
                  className="rounded-xl border border-border-2 bg-surface px-6 py-2.5 font-semibold text-text hover:bg-surface-2"
                  scroll={false}
                >
                  הצגת עוד שאלות
                </Link>
                <span className="tabular text-xs text-muted-2">
                  {visible.length} מתוך {markets.length}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="card p-12 text-center text-muted">
            <div className="text-4xl">🤷</div>
            <p className="mt-2">לא נמצאו שווקים. נסו קטגוריה אחרת או <Link href="/" className="text-accent-2 hover:underline">נקו את הסינון</Link>.</p>
          </div>
        )}
      </section>

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
