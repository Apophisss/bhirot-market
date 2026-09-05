import Link from "next/link";
import { getCategory } from "@/lib/categories";
import { money, timeAgo } from "@/lib/format";
import { analyticsSize } from "@/lib/analytics";
import {
  getAgentRuns,
  getContentHealth,
  getDailyBusiness,
  getDailyTraffic,
  getFunnel,
  getIssues,
  getLiveVisitors,
  getMarketMetrics,
  getTopPages,
  getTopReferrers,
  getTraffic,
  getTradingStats,
  getUserStats,
  range,
} from "@/lib/stats";
import { BarSeries, Card, Funnel, Kpi, TopList, delta, fmt, shortDay } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";

const SEVERITY: Record<string, { label: string; className: string }> = {
  high: { label: "דחוף", className: "bg-no/15 text-no" },
  medium: { label: "כדאי", className: "bg-warn/15 text-warn" },
  low: { label: "קטן", className: "bg-surface-2 text-muted" },
};

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Number((await searchParams).days) || 7;
  const r = range(days);

  const [traffic, dailyTraffic, dailyBusiness, funnel, pages, referrers, trading, users, health, markets, runs, issues, live, size] =
    await Promise.all([
      getTraffic(r),
      getDailyTraffic(r),
      getDailyBusiness(r),
      getFunnel(r),
      getTopPages(r, 8),
      getTopReferrers(r, 8),
      getTradingStats(r),
      getUserStats(r),
      getContentHealth(),
      getMarketMetrics(r, { limit: 8 }),
      getAgentRuns(6),
      getIssues(r),
      getLiveVisitors(),
      analyticsSize(),
    ]);

  const cur = traffic.current;
  const prev = traffic.previous;
  const businessByDay = new Map(dailyBusiness.map((d) => [d.day, d]));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="מבקרים" value={fmt(cur.visitors)} delta={delta(cur.visitors, prev.visitors)} hint={`${live} כרגע באתר`} />
        <Kpi label="צפיות בעמודים" value={fmt(cur.pageviews)} delta={delta(cur.pageviews, prev.pageviews)} hint={`${fmt(cur.pagesPerSession)} לסשן`} />
        <Kpi
          label="נטישה"
          value={`${fmt(cur.bounceRate * 100)}%`}
          tone={cur.bounceRate > 0.7 ? "no" : "neutral"}
          hint={`${fmt(cur.avgSecondsOnPage)} שנ׳ בעמוד`}
        />
        <Kpi label="נרשמים חדשים" value={fmt(users.newInRange)} hint={`${fmt(users.total)} משתמשים בסך הכל`} />
        <Kpi label="עסקאות" value={fmt(trading.trades)} hint={`${fmt(trading.uniqueMarkets)} שווקים · ${fmt(users.activeTraders)} סוחרים`} />
        <Kpi label="נפח מסחר" value={money(trading.volume, { compact: true })} hint={`עסקה ממוצעת ${money(trading.avgSize)}`} />
        <Kpi label="שווקים פתוחים" value={fmt(health.open)} tone={health.overdue > 0 ? "no" : "neutral"} hint={`${health.overdue} מחכים להכרעה`} />
        <Kpi label="אירועי אנליטיקה" value={fmt(size.events)} hint={size.oldest ? `מאז ${timeAgo(size.oldest)}` : "אין נתונים עדיין"} />
      </div>

      <Card title="מה כדאי לתקן" hint="נגזר אוטומטית מהנתונים — אותה רשימה נכנסת גם לבאנדל">
        {issues.length ? (
          <ul className="space-y-2">
            {issues.map((i) => {
              const sev = SEVERITY[i.severity] ?? SEVERITY.low;
              return (
                <li key={i.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${sev.className}`}>{sev.label}</span>
                    <strong className="text-text-strong">{i.title}</strong>
                  </div>
                  <p className="mt-1 text-sm text-muted">{i.detail}</p>
                  <code className="mt-1 block text-xs text-muted-2" dir="ltr">
                    {i.hint}
                  </code>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-muted-2">אין ממצאים — הכול נראה תקין בטווח הזה.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="צפיות בעמודים ליום">
          <BarSeries data={dailyTraffic.map((d) => ({ label: shortDay(d.day), value: d.pageviews, hint: `${d.visitors} מבקרים` }))} />
        </Card>
        <Card title="עסקאות ליום">
          <BarSeries
            data={dailyTraffic.map((d) => {
              const b = businessByDay.get(d.day);
              return { label: shortDay(d.day), value: b?.trades ?? 0, hint: `${fmt(b?.volume ?? 0)} ₪` };
            })}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="משפך" hint="ממבקר ועד עסקה שנייה">
          <Funnel stages={funnel} />
        </Card>
        <Card title="שווקים מובילים" hint="לפי צפיות ועסקאות">
          <TopList
            rows={markets.map((m) => ({
              key: `${getCategory(m.category).label} · ${m.title}`,
              value: m.views,
              hint: `${m.trades} עסקאות`,
              href: `/market/${m.slug}`,
            }))}
            empty="עדיין אין צפיות בשווקים"
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="עמודים מובילים">
          <TopList rows={pages.map((p) => ({ key: p.path, value: p.views, hint: `${fmt(p.avgSeconds)} שנ׳` }))} />
        </Card>
        <Card title="מאיפה מגיעים">
          <TopList rows={referrers.map((x) => ({ key: x.key, value: x.visitors, hint: `${x.count} צפיות` }))} />
        </Card>
      </div>

      <Card
        title="העדכון השעתי"
        hint="ריצות של צוות המערכת (רוטינה / cron / API)"
        action={
          <Link href="/admin/bundle" className="text-sm font-semibold text-accent-2 hover:underline">
            להורדת באנדל הנתונים ←
          </Link>
        }
      >
        <div className="mb-3 flex flex-wrap gap-4 text-sm text-muted">
          <span>
            נוספו השבוע: <strong className="tabular text-text-strong">{health.addedLast7d}</strong>
          </span>
          <span>
            הוכרעו השבוע: <strong className="tabular text-text-strong">{health.resolvedLast7d}</strong>
          </span>
          <span>
            נסגרים ב-24 שעות: <strong className="tabular text-text-strong">{health.closingSoon}</strong>
          </span>
          <span>
            בלי עסקאות: <strong className="tabular text-text-strong">{health.noTrades}</strong>
          </span>
        </div>
        {runs.length ? (
          <ul className="divide-y divide-border text-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <strong className="text-text">{run.source}</strong>{" "}
                  <span className="text-muted">{run.summary || "—"}</span>
                </span>
                <span className="tabular shrink-0 text-xs text-muted-2">
                  +{run.added} · הכרעות {run.resolved} · {timeAgo(run.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-muted-2">אין ריצות מתועדות עדיין.</p>
        )}
      </Card>
    </div>
  );
}
