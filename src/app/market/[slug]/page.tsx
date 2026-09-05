import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth, currentUser } from "@/lib/auth";
import { getMarket, getRecentTrades, getComments, getRelatedMarkets } from "@/lib/markets";
import { getChartHistory } from "@/lib/display-history";
import { getPosition } from "@/lib/portfolio";
import { ensureSynced } from "@/lib/sync";
import { getCategory } from "@/lib/categories";
import { SITE_NAME, SITE_TEAM, isTeamAuthored } from "@/lib/config";
import { absUrl, clamp, marketGraph, shareCard } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { getPerson } from "@/lib/content";
import { money, fmtDateTime, closesLabel, timeAgo } from "@/lib/format";
import { PriceChart } from "@/components/PriceChart";
import { TradePanel } from "@/components/TradePanel";
import { TradeList } from "@/components/TradeList";
import { Comments } from "@/components/Comments";
import { PeopleStack } from "@/components/PeopleStack";
import { MarketCard } from "@/components/MarketCard";
import { StickyTradeBar } from "@/components/StickyTradeBar";
import { ShareButton } from "@/components/ShareButton";
import { THIN_MARKET_TRADES } from "@/lib/limits";
import type { CSSProperties } from "react";

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
        ? "השאלה בוטלה."
        : `${odds} · נסגר ${fmtDateTime(m.closesAt)}.`;
  const description = clamp(`${state} ${m.subtitle ?? m.description}`, 165);

  return {
    title: m.title,
    description,
    keywords: [...m.tags, cat.label, "משחק ניחושים", "בחירות 2026"],
    alternates: { canonical: url },
    // a cancelled question keeps its page for anyone holding a link, but adds nothing to the index
    ...(m.status === "cancelled" ? { robots: { index: false, follow: true } } : {}),
    ...shareCard({
      title: `${m.title} | ${SITE_NAME}`,
      description,
      path: url,
      type: "article",
      // ./og draws this question's own card — the price and the face on it are what
      // make a shared link worth opening, where the one site-wide picture said nothing
      images: [{ url: `${url}/og`, width: 1200, height: 630, type: "image/png", alt: m.title }],
      article: {
        publishedTime: new Date(m.createdAt).toISOString(),
        modifiedTime: new Date(m.updatedAt).toISOString(),
        section: cat.label,
        tags: m.tags,
        authors: [absUrl("/about")],
      },
    }),
  };
}

export default async function MarketPage({ params, searchParams }: { params: Params; searchParams: Promise<{ side?: string; action?: string; amount?: string }> }) {
  await ensureSynced();
  const { slug } = await params;
  const { side, action, amount } = await searchParams;
  const market = await getMarket(slug);
  if (!market) notFound();

  const session = await auth();
  const [chart, recent, comments, user, related] = await Promise.all([
    getChartHistory(market),
    getRecentTrades(slug, 25),
    getComments(slug),
    currentUser(),
    getRelatedMarkets(market, 3),
  ]);
  const position = user ? await getPosition(user.id, slug) : null;
  // The panel keeps the trade in local state, and the portfolio's "סחר" link carries
  // the side and the action in the URL. A second such link to the SAME market is a
  // soft navigation, which would otherwise leave a mounted panel sitting on the
  // previous leg — the key makes the URL the thing that decides what is being traded.
  const tradeKey = `${side ?? ""}-${action ?? ""}-${amount ?? ""}`;
  // the amount survives the trip to Google and back (see LoginLink / TradePanel);
  // anything that is not a plain positive number is simply dropped
  const prefill = amount && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 ? amount : undefined;
  const cat = getCategory(market.category);
  const people = market.people.map((id) => getPerson(id)).filter(Boolean);

  // The single column is capped explicitly: an implicit `auto` track grows to its widest
  // item's min-content (the comment input), which scrolls the whole document on a phone.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
      <JsonLd data={marketGraph(market)} />
      <div className="space-y-4 sm:space-y-5">
        <nav className="-my-1 text-xs text-muted" aria-label="פירורי לחם">
          <Link href="/" className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-text">שאלות</Link> ‹{" "}
          <Link href={`/category/${cat.id}`} className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-text">{cat.label}</Link>
        </nav>

        <header className="flex gap-3 sm:gap-4">
          <PeopleStack photos={market.photos} fallback={cat.cover} size={60} max={3} />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="cat-chip rounded-md px-1.5 py-0.5 font-semibold" style={{ "--cat": cat.accent, "--cat-dark": cat.accentDark } as CSSProperties}>
                {cat.label}
              </span>
              <span className="tabular">
                {market.tradeCount === 0 ? "עדיין אין תשובות" : `${money(market.volume, { compact: true })} · ${market.tradeCount} תשובות`}
              </span>
              <span>·</span>
              <span>{market.status === "open" ? closesLabel(market.closesAt) : market.status === "resolved" ? `הוכרע ${market.resolvedAt ? timeAgo(market.resolvedAt) : ""}` : "בוטל"}</span>
              {isTeamAuthored(market.createdBy) && <span>· נוסף על ידי {SITE_TEAM}</span>}
            </div>
            <h1 className="text-lg font-extrabold leading-tight text-text-strong sm:text-2xl">{market.title}</h1>
            {/*
              A price that one or two answers put there is an opening estimate, not a
              crowd's answer, and presenting it as the latter is what let a single
              7,110-point answer read as "the players say 1%".
            */}
            {market.status === "open" && market.tradeCount < THIN_MARKET_TRADES && (
              <p className="mt-1.5 inline-flex rounded-md bg-warn/10 px-2 py-1 text-[11px] font-semibold text-warn">
                מד ראשוני · עוד כמעט לא ענו — התשובות הראשונות הן שיקבעו אותו
              </p>
            )}
            {market.subtitle && <p className="mt-1 text-sm text-muted">{market.subtitle}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {people.map((p) => (
                <span key={p!.id} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted" title={p!.role}>
                  {p!.name}
                </span>
              ))}
              <ShareButton
                title={market.title}
                path={`/market/${market.id}`}
                text={`${market.title} — ${Math.round(market.probability * 100)}% כן ב${SITE_NAME}`}
                className="py-1.5"
              />
            </div>
          </div>
        </header>

        {market.status !== "open" && (
          <div
            className={`rounded-xl border p-3.5 sm:p-4 ${
              market.status === "cancelled" ? "border-border bg-surface-2" : market.resolution === "YES" ? "border-yes/40 bg-yes/10" : "border-no/40 bg-no/10"
            }`}
          >
            <div className={`text-lg font-extrabold ${market.status === "cancelled" ? "text-muted" : market.resolution === "YES" ? "text-yes" : "text-no"}`}>
              {market.status === "cancelled" ? "השאלה בוטלה" : `התוצאה: ${market.resolution === "YES" ? "כן" : "לא"}`}
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
            key={tradeKey}
            market={{ id: market.id, qYes: market.qYes, qNo: market.qNo, liquidity: market.liquidity, probability: market.probability, isTradable: market.isTradable, status: market.status, resolution: market.resolution }}
            position={position}
            balance={user?.balance ?? null}
            loggedIn={Boolean(session?.user)}
            marketTitle={market.title}
            initialSide={side === "no" ? "NO" : "YES"}
            initialAction={action === "sell" ? "SELL" : "BUY"}
            initialAmount={prefill}
          />
        </div>

        <section className="card p-3.5 sm:p-5">
          <h2 className="mb-2 font-bold text-text-strong">רקע</h2>
          <div className="prose-he whitespace-pre-line text-sm leading-relaxed text-text">{market.description}</div>
          <h2 className="mb-2 mt-5 font-bold text-text-strong">כללי הכרעה</h2>
          <div className="prose-he whitespace-pre-line rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-text">{market.resolutionCriteria}</div>
          <div className="mt-3 text-xs text-muted-2">התשובה תיוודע: {fmtDateTime(market.closesAt)} · נוצר {fmtDateTime(market.createdAt)}</div>
          {market.sources.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-bold text-text-strong">מקורות</h3>
              <ul className="space-y-1 text-sm">
                {market.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      data-evt="market-source"
                      data-evt-market={market.id}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-11 items-center text-accent-2 hover:underline"
                    >
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
                  rel="nofollow" className="tap inline-flex min-w-11 items-center justify-center rounded-full bg-surface-2 px-2.5 text-xs text-muted hover:text-text">
                  #{t}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card p-3.5 sm:p-5">
          <h2 className="mb-2 font-bold text-text-strong">תשובות אחרונות</h2>
          <TradeList trades={recent} />
        </section>

        <Comments marketId={market.id} comments={comments} loggedIn={Boolean(session?.user)} />

        {related.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold text-text-strong">שאלות קשורות</h2>
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
            key={tradeKey}
            market={{ id: market.id, qYes: market.qYes, qNo: market.qNo, liquidity: market.liquidity, probability: market.probability, isTradable: market.isTradable, status: market.status, resolution: market.resolution }}
            position={position}
            balance={user?.balance ?? null}
            loggedIn={Boolean(session?.user)}
            marketTitle={market.title}
            initialSide={side === "no" ? "NO" : "YES"}
            initialAction={action === "sell" ? "SELL" : "BUY"}
            initialAmount={prefill}
          />
          <div className="card p-4 text-xs leading-relaxed text-muted">
            <strong className="text-text">איך זה עובד?</strong> כל תשובת ״כן״ שווה נקודה אם התשובה היא כן, ואפס אחרת (ולהפך לתשובת ״לא״).
            המד מראה כמה בטוחים בה השחקנים כרגע. <Link href="/about" className="text-accent-2 hover:underline">עוד</Link>
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
