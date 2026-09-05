import { EVENT_LABELS, CLICK_IDS } from "@/lib/events";
import {
  getCampaigns,
  getClickTotals,
  getClientErrors,
  getCountrySplit,
  getDailyTraffic,
  getDeviceSplit,
  getEventTotals,
  getHourHistogram,
  getSearchTerms,
  getSlowPages,
  getTopPages,
  getTopReferrers,
  getWebVitals,
  range,
} from "@/lib/stats";
import { BarSeries, Card, TopList, fmt, shortDay } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "תנועה" };

/** Google's thresholds for a "good" experience, so a number can be judged at a glance. */
const VITAL_BUDGET: Record<string, number> = { LCP: 2500, FCP: 1800, TTFB: 800, INP: 200, CLS: 0.1, FID: 100 };

export default async function AdminTraffic({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Number((await searchParams).days) || 7;
  const r = range(days);

  const [daily, pages, referrers, campaigns, devices, countries, hours, events, clicks, searches, vitals, slow, errors] = await Promise.all([
    getDailyTraffic(r),
    getTopPages(r, 20),
    getTopReferrers(r, 12),
    getCampaigns(r, 12),
    getDeviceSplit(r),
    getCountrySplit(r, 8),
    getHourHistogram(r),
    getEventTotals(r),
    getClickTotals(r, 20),
    getSearchTerms(r, 15),
    getWebVitals(r),
    getSlowPages(r, 8),
    getClientErrors(r, 10),
  ]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="מבקרים ליום">
          <BarSeries data={daily.map((d) => ({ label: shortDay(d.day), value: d.visitors, hint: `${d.pageviews} צפיות` }))} />
        </Card>
        <Card title="סשנים ליום">
          <BarSeries data={daily.map((d) => ({ label: shortDay(d.day), value: d.sessions }))} />
        </Card>
      </div>

      <Card title="שעות היום" hint="מתי נכנסים ומתי סוחרים — שעון ישראל">
        <BarSeries data={hours.map((h) => ({ label: `${h.hour}:00`, value: h.pageviews, hint: `${h.trades} עסקאות` }))} />
      </Card>

      <Card title="עמודים">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-right font-medium">נתיב</th>
                <th className="px-3 py-2 text-right font-medium">צפיות</th>
                <th className="px-3 py-2 text-right font-medium">מבקרים</th>
                <th className="px-3 py-2 text-right font-medium">שניות בעמוד</th>
                <th className="px-3 py-2 text-right font-medium">נטישה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pages.map((p) => (
                <tr key={p.path} className="hover:bg-surface-2/60">
                  <td className="max-w-md truncate px-3 py-2" dir="ltr">
                    <a href={p.path} className="text-text hover:text-accent-2 hover:underline">
                      {p.path}
                    </a>
                  </td>
                  <td className="tabular px-3 py-2 font-semibold">{fmt(p.views)}</td>
                  <td className="tabular px-3 py-2 text-muted">{fmt(p.visitors)}</td>
                  <td className="tabular px-3 py-2 text-muted">{fmt(p.avgSeconds)}</td>
                  <td className={`tabular px-3 py-2 ${p.bounceRate > 0.7 ? "text-no" : "text-muted"}`}>{fmt(p.bounceRate * 100)}%</td>
                </tr>
              ))}
              {!pages.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-2">
                    אין צפיות בטווח הזה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="מקורות תנועה">
          <TopList rows={referrers.map((x) => ({ key: x.key, value: x.visitors, hint: `${x.count} צפיות` }))} />
        </Card>
        <Card title="קמפיינים (utm)" hint="source / medium / campaign">
          <TopList rows={campaigns.map((x) => ({ key: x.key, value: x.visitors }))} empty="אין תנועה מתויגת utm" />
        </Card>
        <Card title="מכשירים">
          <TopList rows={devices.map((x) => ({ key: x.key, value: x.visitors, hint: `${x.count} צפיות` }))} />
        </Card>
        <Card title="מדינות">
          <TopList rows={countries.map((x) => ({ key: x.key, value: x.visitors }))} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="אירועים" hint="כל מה שנמדד באתר">
          <TopList rows={events.map((x) => ({ key: EVENT_LABELS[x.key] ?? x.key, value: x.count, hint: `${x.visitors} מבקרים` }))} />
        </Card>
        <Card title="לחיצות" hint="אלמנטים עם data-evt">
          <TopList rows={clicks.map((x) => ({ key: CLICK_IDS[x.key] ?? x.key, value: x.count }))} empty="אין לחיצות מתועדות" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="מה מחפשים" hint="חיפושים מהשורה העליונה">
          <TopList rows={searches.map((x) => ({ key: x.key, value: x.count }))} empty="אין חיפושים בטווח" />
        </Card>
        <Card title="שגיאות דפדפן">
          <TopList rows={errors.map((x) => ({ key: x.message, value: x.count, hint: x.path }))} empty="אין שגיאות — מצוין" />
        </Card>
      </div>

      <Card title="ביצועים בשדה (Core Web Vitals)" hint="נמדד אצל הגולשים עצמם">
        {vitals.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">מדד</th>
                  <th className="px-3 py-2 text-right font-medium">דגימות</th>
                  <th className="px-3 py-2 text-right font-medium">p50</th>
                  <th className="px-3 py-2 text-right font-medium">p75</th>
                  <th className="px-3 py-2 text-right font-medium">p95</th>
                  <th className="px-3 py-2 text-right font-medium">יעד</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vitals.map((v) => {
                  const budget = VITAL_BUDGET[v.metric];
                  const bad = budget != null && v.p75 > budget;
                  return (
                    <tr key={v.metric}>
                      <td className="px-3 py-2 font-semibold" dir="ltr">
                        {v.metric}
                      </td>
                      <td className="tabular px-3 py-2 text-muted">{fmt(v.samples)}</td>
                      <td className="tabular px-3 py-2">{fmt(v.p50)}</td>
                      <td className={`tabular px-3 py-2 font-semibold ${bad ? "text-no" : "text-yes"}`}>{fmt(v.p75)}</td>
                      <td className="tabular px-3 py-2 text-muted">{fmt(v.p95)}</td>
                      <td className="tabular px-3 py-2 text-muted-2">{budget != null ? fmt(budget) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-2">עדיין אין דגימות ביצועים.</p>
        )}
        {slow.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-text">העמודים האיטיים ביותר (LCP ממוצע)</h3>
            <TopList rows={slow.map((s) => ({ key: s.path, value: Math.round(s.avgLcp), hint: `${s.samples} דגימות` }))} unit="ms" />
          </div>
        )}
      </Card>
    </div>
  );
}
