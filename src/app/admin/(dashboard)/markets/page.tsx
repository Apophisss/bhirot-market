import Link from "next/link";
import { getCategory } from "@/lib/categories";
import { fmtDateTime, hoursUntil, money, pct } from "@/lib/format";
import { getCalibration, getCategoryMetrics, getContentHealth, getMarketMetrics, range } from "@/lib/stats";
import { Card, Kpi, TopList, fmt } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "שווקים" };

export default async function AdminMarkets({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Number((await searchParams).days) || 7;
  const r = range(days);
  const [health, calibration, categories, markets] = await Promise.all([
    getContentHealth(),
    getCalibration(),
    getCategoryMetrics(r),
    getMarketMetrics(r, { limit: 200 }),
  ]);

  const overdue = markets.filter((m) => m.status === "open" && hoursUntil(m.closesAt) <= 0);
  const untraded = markets.filter((m) => m.status === "open" && m.trades === 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="שווקים פתוחים" value={fmt(health.open)} hint={`${health.resolved} הוכרעו · ${health.cancelled} בוטלו`} />
        <Kpi label="מחכים להכרעה" value={fmt(health.overdue)} tone={health.overdue > 0 ? "no" : "yes"} hint="עבר מועד הסגירה" />
        <Kpi label="בלי אף עסקה" value={fmt(health.noTrades)} tone={health.noTrades > health.open / 2 ? "no" : "neutral"} hint="מתוך הפתוחים" />
        <Kpi label="נסגרים ב-24 שעות" value={fmt(health.closingSoon)} tone={health.closingSoon === 0 ? "no" : "yes"} hint="מה שמחזיר אנשים לאתר" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="כיול המחירים" hint="ציון ברייר: 0 = חיזוי מושלם, 0.25 = מטבע הוגן">
          {calibration.resolved ? (
            <dl className="space-y-2 text-sm">
              <Row label="שווקים שהוכרעו" value={fmt(calibration.resolved)} />
              <Row label="Brier של המחיר הפותח (צוות המערכת)" value={fmt(calibration.brierInitial)} tone={calibration.brierInitial < 0.25} />
              <Row label="Brier של המחיר לפני ההכרעה (השוק)" value={fmt(calibration.brierFinal)} tone={calibration.brierFinal < calibration.brierInitial} />
              <Row label="שיעור התשובות 'כן'" value={pct(calibration.yesRate)} />
              <Row label="שעות ממוצעות עד הכרעה" value={fmt(calibration.avgHoursOpen)} />
            </dl>
          ) : (
            <p className="py-6 text-center text-sm text-muted-2">עדיין לא הוכרעו שווקים.</p>
          )}
        </Card>

        <Card title="קטגוריות" hint="מה מושך צפיות ומה מייצר עסקאות">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">קטגוריה</th>
                  <th className="px-3 py-2 text-right font-medium">שווקים</th>
                  <th className="px-3 py-2 text-right font-medium">צפיות</th>
                  <th className="px-3 py-2 text-right font-medium">עסקאות</th>
                  <th className="px-3 py-2 text-right font-medium">המרה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map((c) => {
                  const cat = getCategory(c.category);
                  return (
                    <tr key={c.category} className="hover:bg-surface-2/60">
                      <td className="px-3 py-2">
                        <span className="me-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: cat.accent }} aria-hidden />
                        {cat.label}
                      </td>
                      <td className="tabular px-3 py-2 text-muted">
                        {fmt(c.open)}/{fmt(c.markets)}
                      </td>
                      <td className="tabular px-3 py-2">{fmt(c.views)}</td>
                      <td className="tabular px-3 py-2 font-semibold">{fmt(c.trades)}</td>
                      <td className="tabular px-3 py-2 text-muted">{fmt(c.avgConversion * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="כל השווקים" hint={`מעורבות ב-${days} הימים האחרונים`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-right font-medium">שוק</th>
                <th className="px-3 py-2 text-right font-medium">סטטוס</th>
                <th className="px-3 py-2 text-right font-medium">מחיר</th>
                <th className="px-3 py-2 text-right font-medium">צפיות</th>
                <th className="px-3 py-2 text-right font-medium">מבקרים</th>
                <th className="px-3 py-2 text-right font-medium">עסקאות</th>
                <th className="px-3 py-2 text-right font-medium">נפח</th>
                <th className="px-3 py-2 text-right font-medium">המרה</th>
                <th className="px-3 py-2 text-right font-medium">נסגר</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {markets.map((m) => (
                <tr key={m.slug} className="hover:bg-surface-2/60">
                  <td className="max-w-sm px-3 py-2">
                    <Link href={`/market/${m.slug}`} className="line-clamp-2 text-text hover:text-accent-2">
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {m.status === "open" ? (
                      hoursUntil(m.closesAt) <= 0 ? (
                        <span className="text-no">להכרעה</span>
                      ) : (
                        <span className="text-yes">פתוח</span>
                      )
                    ) : (
                      <span className="text-muted">{m.status === "cancelled" ? "בוטל" : `הוכרע: ${m.resolution === "YES" ? "כן" : "לא"}`}</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2">{pct(m.probability)}</td>
                  <td className="tabular px-3 py-2">{fmt(m.views)}</td>
                  <td className="tabular px-3 py-2 text-muted">{fmt(m.visitors)}</td>
                  <td className="tabular px-3 py-2 font-semibold">{fmt(m.trades)}</td>
                  <td className="tabular px-3 py-2">{money(m.volume, { compact: true })}</td>
                  <td className={`tabular px-3 py-2 ${m.visitors >= 10 && m.conversion === 0 ? "text-no" : "text-muted"}`}>
                    {fmt(m.conversion * 100)}%
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-2">{fmtDateTime(m.closesAt)}</td>
                </tr>
              ))}
              {!markets.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-2">
                    אין שווקים.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="מחכים להכרעה" hint="עבר מועד הסגירה — כסף של סוחרים תקוע">
          <TopList
            rows={overdue.map((m) => ({ key: m.title, value: m.trades, hint: fmtDateTime(m.closesAt), href: `/market/${m.slug}` }))}
            empty="אין שווקים באיחור 🎉"
          />
        </Card>
        <Card title="פתוחים בלי עסקאות" hint="שאלות שאף אחד לא נגע בהן">
          <TopList
            rows={untraded.map((m) => ({ key: m.title, value: m.views, hint: `${m.visitors} מבקרים`, href: `/market/${m.slug}` }))}
            empty="כל השווקים הפתוחים נסחרים"
          />
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular font-semibold ${tone === undefined ? "text-text" : tone ? "text-yes" : "text-no"}`}>{value}</dd>
    </div>
  );
}
