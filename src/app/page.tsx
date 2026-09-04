import Link from "next/link";
import { listMarkets, getMarketStats, type MarketSort } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { MarketCard } from "@/components/MarketCard";
import { CategoryTabs } from "@/components/CategoryTabs";
import { AgentBadge } from "@/components/AgentBadge";
import { Countdown } from "@/components/Countdown";
import { money } from "@/lib/format";
import { SITE_TAGLINE } from "@/lib/config";

export const dynamic = "force-dynamic";

type Search = { category?: string; q?: string; sort?: string; status?: string };

const SORTS: { id: MarketSort; label: string }[] = [
  { id: "trending", label: "חם" },
  { id: "newest", label: "חדש" },
  { id: "closing", label: "נסגר בקרוב" },
  { id: "volume", label: "נפח" },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  await ensureSynced();
  const sp = await searchParams;
  const category = sp.category ?? "all";
  const sort = (SORTS.find((s) => s.id === sp.sort)?.id ?? "trending") as MarketSort;
  const status = sp.status === "resolved" ? "resolved" : "open";
  const q = sp.q?.trim() || undefined;
  const filtered = Boolean(q || category !== "all" || status === "resolved");

  const [markets, stats, recentlyResolved] = await Promise.all([
    listMarkets({ category, q, sort, status }),
    getMarketStats(),
    status === "open" && !filtered ? listMarkets({ status: "resolved", sort: "newest", limit: 6 }) : Promise.resolve([]),
  ]);

  const link = (patch: Partial<Search>) => {
    const next = { ...sp, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "category" && v === "all") && !(k === "status" && v === "open")) usp.set(k, v);
    const s = usp.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="space-y-6">
      {!filtered && (
        <section className="relative overflow-hidden rounded-3xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hero.svg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-l from-bg/90 via-bg/60 to-transparent" />
          <div className="relative flex flex-col gap-5 p-6 sm:p-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <AgentBadge />
              <h1 className="mt-4 text-3xl font-black leading-tight text-text-strong sm:text-5xl">{SITE_TAGLINE}</h1>
              <p className="mt-3 max-w-xl text-base text-muted sm:text-lg">
                סקרים, קואליציות, משפטים, תביעות ומהלכים פוליטיים — מי צודק, השוק או הפרשנים? סחרו בכסף וירטואלי על השאלות
                החדות של הקמפיין, שמתעדכנות כל שעה.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/login" className="rounded-xl bg-accent px-5 py-2.5 font-bold text-white shadow-lg shadow-accent/25 hover:bg-accent-2">
                  התחברות וקבלת ₪10,000 וירטואליים
                </Link>
                <Link href="/about" className="rounded-xl border border-border-2 bg-surface/70 px-5 py-2.5 font-semibold text-text hover:bg-surface">
                  איך זה עובד?
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Countdown />
              <div className="flex gap-4 text-xs text-muted">
                <span><strong className="tabular text-text-strong">{stats.open}</strong> שווקים פתוחים</span>
                <span><strong className="tabular text-text-strong">{stats.resolved}</strong> הוכרעו</span>
                <span><strong className="tabular text-text-strong">{money(stats.volume, { compact: true })}</strong> נפח</span>
                <span><strong className="tabular text-text-strong">{stats.users}</strong> סוחרים</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <CategoryTabs active={category} params={{ q, sort: sp.sort, status: sp.status }} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-sm">
            <Link href={link({ status: "open" })} className={`rounded-lg px-3 py-1.5 font-semibold ${status === "open" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}>
              פתוחים
            </Link>
            <Link href={link({ status: "resolved" })} className={`rounded-lg px-3 py-1.5 font-semibold ${status === "resolved" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}>
              הוכרעו
            </Link>
            {q && (
              <span className="ms-2 flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted">
                חיפוש: <strong className="text-text">{q}</strong>
                <Link href={link({ q: undefined })} className="ms-1 text-muted-2 hover:text-no" aria-label="נקה חיפוש">✕</Link>
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

        {markets.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {markets.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
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
