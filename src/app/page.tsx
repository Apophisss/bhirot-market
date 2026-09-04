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
    <div className="space-y-5 sm:space-y-6">
      {/* signed-in phone users skip the pitch and land straight on the board */}
      {!filtered && session?.user && (
        <section className="card flex items-center justify-between gap-3 p-3 sm:hidden">
          <Countdown variant="card" />
          <div className="tabular shrink-0 text-left text-[11px] leading-tight text-muted">
            <div>
              <strong className="text-text-strong">{stats.open}</strong> שווקים
            </div>
            <div>
              <strong className="text-text-strong">{money(stats.volume, { compact: true })}</strong> נפח
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
          <div className="relative flex flex-col gap-4 p-5 sm:gap-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
            <div className="max-w-2xl">
              <AgentBadge />
              <h1 className="mt-3 text-[25px] font-black leading-tight text-white sm:mt-4 sm:text-4xl lg:text-5xl">{SITE_TAGLINE}</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75 sm:mt-3 sm:text-lg">
                סקרים, קואליציות, משפטים, תביעות ומהלכים פוליטיים — מי צודק, השוק או הפרשנים? סחרו בכסף וירטואלי על
                {" "}
                <strong className="text-white">{stats.open} השאלות</strong> החדות של הקמפיין, שמתעדכנות כל שעה.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:flex-wrap sm:gap-3">
                {session?.user ? (
                  <Link
                    href="/portfolio"
                    className="tap pressable flex items-center justify-center rounded-xl bg-white px-5 py-3 font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft sm:py-2.5"
                  >
                    לתיק שלי
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="tap pressable flex items-center justify-center rounded-xl bg-white px-5 py-3 text-center font-bold text-accent shadow-lg shadow-ink/30 hover:bg-accent-soft sm:py-2.5"
                  >
                    <span className="sm:hidden">התחברות · ₪10,000 וירטואליים</span>
                    <span className="hidden sm:inline">התחברות וקבלת ₪10,000 וירטואליים</span>
                  </Link>
                )}
                <Link
                  href="/about"
                  className="tap pressable flex items-center justify-center rounded-xl border border-white/35 bg-white/10 px-5 py-3 font-semibold text-white hover:bg-white/20 sm:py-2.5"
                >
                  איך זה עובד?
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Countdown />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-white/70 sm:flex sm:flex-wrap">
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
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-base font-bold text-text-strong sm:text-lg">⏱️ נסגר היום או מחר</h2>
            <Link href="/?sort=closing" className="-my-1 inline-flex items-center py-1.5 text-[13px] text-accent-2 hover:underline sm:text-sm">
              כל השאלות לפי מועד סגירה
            </Link>
          </div>
          <p className="-mt-1 text-[13px] text-muted sm:text-sm">שאלות שההכרעה שלהן מגיעה תוך שעות — המקום הכי טוב להתחיל לשחק בו.</p>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {closingSoon.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-text-strong sm:text-lg">🔥 השאלות הבוערות</h2>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {featured.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {/* the header search only appears from md up — on phones it lives here, above the board */}
        <form action="/" className="md:hidden">
          {category !== "all" && <input type="hidden" name="category" value={category} />}
          {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
          <label className="relative block">
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-2">🔎</span>
            <input
              name="q"
              type="search"
              defaultValue={q ?? ""}
              enterKeyHint="search"
              placeholder="חיפוש שוק: נתניהו, סקר, בנט…"
              className="tap w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-10 pl-3 outline-none placeholder:text-muted-2 focus:border-accent focus:bg-surface"
            />
          </label>
        </form>

        <CategoryTabs active={category} params={{ q, sort: sp.sort, status: sp.status, person: person?.id }} counts={counts} />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="scrollbar-none swipe-x -mx-3 flex items-center gap-1 px-3 text-sm sm:mx-0 sm:px-0">
            <Link
              href={link({ status: "open", show: undefined })}
              className={`shrink-0 rounded-lg px-3 py-2 font-semibold ${status === "open" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
            >
              פתוחים
            </Link>
            <Link
              href={link({ status: "resolved", show: undefined })}
              className={`shrink-0 rounded-lg px-3 py-2 font-semibold ${status === "resolved" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
            >
              הוכרעו
            </Link>
            {q && (
              <span className="ms-1 flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs text-muted">
                חיפוש: <strong className="text-text">{q}</strong>
                <Link href={link({ q: undefined })} className="ms-1 px-1 text-muted-2 hover:text-no" aria-label="נקה חיפוש">✕</Link>
              </span>
            )}
            {person && (
              <span className="ms-1 flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs text-muted">
                מועמד: <strong className="text-text">{person.name}</strong>
                <Link href={link({ person: undefined })} className="ms-1 px-1 text-muted-2 hover:text-no" aria-label="נקה סינון מועמד">✕</Link>
              </span>
            )}
          </div>
          <div className="scrollbar-none swipe-x -mx-3 flex items-center gap-1 px-3 text-[13px] sm:mx-0 sm:px-0 sm:text-xs">
            <span className="me-1 shrink-0 text-muted-2">מיון:</span>
            {SORTS.map((s) => (
              <Link
                key={s.id}
                href={link({ sort: s.id })}
                className={`shrink-0 rounded-md px-2.5 py-1.5 font-semibold ${sort === s.id ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {rest.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {rest.map((m) => (
                <MarketCard key={m.id} m={m} />
              ))}
            </div>
            {markets.length > show && (
              <div className="flex flex-col items-center gap-1 pt-2">
                <Link
                  href={link({ show: String(show + PAGE) })}
                  className="tap pressable flex w-full items-center justify-center rounded-xl border border-border-2 bg-surface px-6 font-semibold text-text hover:bg-surface-2 sm:w-auto"
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
          <div className="card p-8 text-center text-muted sm:p-12">
            <div className="text-4xl">🤷</div>
            <p className="mt-2">לא נמצאו שווקים. נסו קטגוריה אחרת או <Link href="/" className="text-accent-2 hover:underline">נקו את הסינון</Link>.</p>
          </div>
        )}
      </section>

      {recentlyResolved.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold text-text-strong sm:text-lg">הוכרעו לאחרונה</h2>
            <Link href="/?status=resolved" className="-my-1 inline-flex shrink-0 items-center py-1.5 text-[13px] text-accent-2 hover:underline sm:text-sm">כל ההכרעות</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {recentlyResolved.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
