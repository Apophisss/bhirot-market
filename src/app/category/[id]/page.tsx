import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORIES, findCategory } from "@/lib/categories";
import { listMarkets, getCategoryCounts } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { MarketBrowser, PAGE, parseSort } from "@/components/MarketBrowser";
import { JsonLd } from "@/components/JsonLd";
import { SITE_NAME } from "@/lib/config";
import { breadcrumbs, categoryTitle, clamp, collectionPage, shareCard } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = { q?: string; sort?: string; status?: string; show?: string };

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const { id } = await params;
  const cat = findCategory(id);
  // resolved before the streaming shell is flushed, so this is a real 404, not a soft one
  if (!cat) notFound();
  const sp = await searchParams;
  const noise = Boolean(sp.q || sp.sort || sp.show || sp.status === "resolved");
  const title = categoryTitle(cat);
  const description = clamp(cat.description, 300);
  return {
    title,
    description,
    ...(noise
      ? { robots: { index: false, follow: true } }
      : { alternates: { canonical: `/category/${cat.id}` } }),
    ...shareCard({ title: `${title} | ${SITE_NAME}`, description, path: `/category/${cat.id}` }),
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: Promise<Search> }) {
  await ensureSynced();
  const { id } = await params;
  const cat = findCategory(id);
  if (!cat) notFound();

  const sp = await searchParams;
  const sort = parseSort(sp.sort);
  const status = sp.status === "resolved" ? "resolved" : "open";
  const q = sp.q?.trim() || undefined;
  const show = Math.min(Math.max(Number(sp.show) || PAGE, PAGE), 600);

  const [markets, counts] = await Promise.all([
    listMarkets({ category: cat.id, q, sort, status, limit: 600 }),
    getCategoryCounts(status),
  ]);
  const visible = markets.slice(0, show);
  const openCount = counts[cat.id] ?? markets.length;

  const indexable = !q && !sp.sort && !sp.show && status === "open";

  return (
    <div className="space-y-6">
      {indexable && (
        <JsonLd
          data={collectionPage({
            path: `/category/${cat.id}`,
            name: categoryTitle(cat),
            description: cat.description,
            markets: visible.slice(0, 30),
          })}
        />
      )}
      <JsonLd
        data={breadcrumbs([
          { name: "שווקים", path: "/" },
          { name: cat.label, path: `/category/${cat.id}` },
        ])}
      />

      <nav className="text-xs text-muted" aria-label="פירורי לחם">
        <Link href="/" className="hover:text-text">שווקים</Link> ‹ <span className="text-text">{cat.label}</span>
      </nav>

      <header className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: `${cat.accent}33`, background: `${cat.accent}0d` }}>
        <h1 className="text-2xl font-black text-text-strong sm:text-3xl">
          {cat.label} — שוקי חיזוי לבחירות 2026
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text sm:text-[15px]">{cat.description}</p>
        <p className="mt-3 text-xs text-muted">
          {status === "resolved" ? `${markets.length} שווקים שהוכרעו בקטגוריה` : `${openCount} שווקים פתוחים למסחר`} · המסחר
          בכסף וירטואלי בלבד ·{" "}
          <Link href="/about" className="text-accent-2 hover:underline">
            איך זה עובד
          </Link>
        </p>
      </header>

      <MarketBrowser
        basePath={`/category/${cat.id}`}
        category={cat.id}
        params={{ q, sort: sp.sort, status: sp.status, show: sp.show }}
        items={visible}
        shown={visible.length}
        total={markets.length}
        counts={counts}
      />

      <section className="card p-5">
        <h2 className="text-base font-bold text-text-strong">קטגוריות נוספות</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.filter((c) => c.id !== cat.id).map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.id}`}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:border-border-2 hover:text-text-strong"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
