import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth, currentUser } from "@/lib/auth";
import { getMarket, getComments, getRelatedMarkets } from "@/lib/markets";
import { getChartHistory } from "@/lib/display-history";
import { getPosition } from "@/lib/portfolio";
import { ensureSynced } from "@/lib/sync";
import { getCategory } from "@/lib/categories";
import { SITE_NAME, SITE_TEAM, isTeamAuthored } from "@/lib/config";
import { absUrl, clamp, marketGraph } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { getPerson } from "@/lib/content";
import { money, fmtDateTime, closesLabel, timeAgo } from "@/lib/format";
import { PriceChart } from "@/components/PriceChart";
import { TradePanel } from "@/components/TradePanel";
import { Comments } from "@/components/Comments";
import { PeopleStack } from "@/components/PeopleStack";
import { MarketCard } from "@/components/MarketCard";
import { StickyTradeBar } from "@/components/StickyTradeBar";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMarket(slug);
  // metadata resolves before the streaming shell is flushed, so notFound() here
  // still yields a real 404 status instead of a soft 404
  if (!m) notFound();

  const cat = getCategory(m.category);
  const url = `/market/${m.id}`;
  const odds = `${Math.round(m.probability * 100)}% כן`;
  const state =
    m.status === "resolved"
      ? `הוכרע: ${m.resolution === "YES" ? "כן" : "לא"}.`
      : m.status === "cancelled"
        ? "השוק בוטל."
        : `${odds} · נסגר ${fmtDateTime(m.closesAt)}.`;
  const description = clamp(`${state} ${m.subtitle ?? m.description}`, 165);
  // person photos are portraits — the wide site card reads better when they are shared
  const ogImage = m.image.startsWith("/people/") ? "/og.png" : m.image;

  return {
    title: m.title,
    description,
    keywords: [...m.tags, cat.label, "שוק חיזויים", "בחירות 2026"],
    alternates: { canonical: url },
    // a cancelled question keeps its page for anyone holding a link, but adds nothing to the index
    ...(m.status === "cancelled" ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "article",
      url,
      title: `${m.title} | ${SITE_NAME}`,
      description,
      publishedTime: new Date(m.createdAt).toISOString(),
      modifiedTime: new Date(m.updatedAt).toISOString(),
      section: cat.label,
      tags: m.tags,
      authors: [absUrl("/about")],
      images: [{ url: ogImage, alt: m.title }],
    },
    twitter: { card: "summary_large_image", title: m.title, description, images: [ogImage] },
  };
}

export default async function MarketPage({ params, searchParams }: { params: Params; searchParams: Promise<{ side?: string }> }) {
  await ensureSynced();
  const { slug } = await params;
  const { side } = await searchParams;
  const market = await getMarket(slug);
  if (!market) notFound();

  const session = await auth();
  const [chart, comments, user, related] = await Promise.all([
    getChartHistory(market),
    getComments(slug),
    currentUser(),
    getRelatedMarkets(market, 3),
  ]);
  const position = user ? await getPosition(user.id, slug) : null;
  const cat = getCategory(market.category);
  const people = market.people.map((id) => getPerson(id)).filter(Boolean);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
      <JsonLd data={marketGraph(market)} />
      <div className="space-y-4 sm:space-y-5">
        <nav className="-my-1 text-xs text-muted" aria-label="פירורי לחם">
          <Link href="/" className="inline-block py-1 hover:text-text">שווקים</Link> ‹{" "}
          <Link href={`/category/${cat.id}`} className="inline-block py-1 hover:text-text">{cat.label}</Link>
        </nav>

        <header className="flex gap-3 sm:gap-4">
          <PeopleStack photos={market.photos} fallback={cat.cover} size={60} max={3} />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-md px-1.5 py-0.5 font-semibold" style={{ background: `${cat.accent}22`, color: cat.accent }}>
                {cat.label}
              </span>
              <span className="tabular">{money(market.volume, { compact: true })} נפח</span>
              <span>·</span>
              <span>{market.status === "open" ? closesLabel(market.closesAt) : market.status === "resolved" ? `הוכרע ${market.resolvedAt ? timeAgo(market.resolvedAt) : ""}` : "בוטל"}</span>
              {isTeamAuthored(market.createdBy) && <span>· נוסף על ידי {SITE_TEAM}</span>}
            </div>
            <h1 className="text-lg font-extrabold leading-tight text-text-strong sm:text-2xl">{market.title}</h1>
            {market.subtitle && <p className="mt-1 text-sm text-muted">{market.subtitle}</p>}
            {people.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <span key={p!.id} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted" title={p!.role}>
                    {p!.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {market.status !== "open" && (
          <div
            className={`rounded-xl border p-3.5 sm:p-4 ${
              market.status === "cancelled" ? "border-border bg-surface-2" : market.resolution === "YES" ? "border-yes/40 bg-yes/10" : "border-no/40 bg-no/10"
            }`}
          >
            <div className={`text-lg font-extrabold ${market.status === "cancelled" ? "text-muted" : market.resolution === "YES" ? "text-yes" : "text-no"}`}>
              {market.status === "cancelled" ? "השוק בוטל" : `התוצאה: ${market.resolution === "YES" ? "כן" : "לא"}`}
            </div>
            {market.resolutionNote && <p className="mt-1 whitespace-pre-wrap text-sm text-text">{market.resolutionNote}</p>}
          </div>
        )}

        <PriceChart
          points={chart.points}
          current={market.probability}
          isOpen={market.status === "open"}
          estimateBand={chart.synthetic ? chart.maxDeviation : undefined}
          tradeCount={market.tradeCount}
          now={chart.now}
        />

        <div id="trade" className="scroll-mt-20 lg:hidden">
          <TradePanel
            market={{ id: market.id, qYes: market.qYes, qNo: market.qNo, liquidity: market.liquidity, probability: market.probability, isTradable: market.isTradable, status: market.status, resolution: market.resolution }}
            position={position}
            balance={user?.balance ?? null}
            loggedIn={Boolean(session?.user)}
            initialSide={side === "no" ? "NO" : "YES"}
          />
        </div>

        <section className="card p-3.5 sm:p-5">
          <h2 className="mb-2 font-bold text-text-strong">רקע</h2>
          <div className="prose-he whitespace-pre-line text-sm leading-relaxed text-text">{market.description}</div>
          <h2 className="mb-2 mt-5 font-bold text-text-strong">כללי הכרעה</h2>
          <div className="prose-he whitespace-pre-line rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-text">{market.resolutionCriteria}</div>
          <div className="mt-3 text-xs text-muted-2">סגירת המסחר: {fmtDateTime(market.closesAt)} · נוצר {fmtDateTime(market.createdAt)}</div>
          {market.sources.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-bold text-text-strong">מקורות</h3>
              <ul className="space-y-1 text-sm">
                {market.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-block py-1 text-accent-2 hover:underline">
                      {s.title}
                    </a>
                    <span className="ms-1 text-xs text-muted-2">({safeHost(s.url)})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {market.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {market.tags.map((t) => (
                <Link key={t} href={`/?q=${encodeURIComponent(t)}`}
                  rel="nofollow" className="rounded-full bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-text">
                  #{t}
                </Link>
              ))}
            </div>
          )}
        </section>

        <Comments marketId={market.id} comments={comments} loggedIn={Boolean(session?.user)} />

        {related.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold text-text-strong">שווקים קשורים</h2>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {related.map((r) => (
                <MarketCard key={r.id} m={r} />
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          <TradePanel
            market={{ id: market.id, qYes: market.qYes, qNo: market.qNo, liquidity: market.liquidity, probability: market.probability, isTradable: market.isTradable, status: market.status, resolution: market.resolution }}
            position={position}
            balance={user?.balance ?? null}
            loggedIn={Boolean(session?.user)}
            initialSide={side === "no" ? "NO" : "YES"}
          />
          <div className="card p-4 text-xs leading-relaxed text-muted">
            <strong className="text-text">איך זה עובד?</strong> כל מניית ״כן״ משלמת ₪1 וירטואלי אם התשובה היא כן, ו־₪0 אחרת (ולהפך למניית ״לא״).
            המחיר משקף את ההסתברות שהשוק מייחס לתוצאה. <Link href="/about" className="text-accent-2 hover:underline">עוד</Link>
          </div>
        </div>
      </aside>

      {market.isTradable && <StickyTradeBar probability={market.probability} />}
    </div>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
