import { STARTING_BALANCE } from "@/lib/db/schema";
import { getTopTradersForAdmin } from "@/lib/portfolio";
import { money, signedMoney } from "@/lib/format";
import { getDailyBusiness, getRetention, getTradingStats, getUserStats, range } from "@/lib/stats";
import { BarSeries, Card, Kpi, fmt, shortDay } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "משתמשים" };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Number((await searchParams).days) || 7;
  const r = range(days);
  const [users, cohorts, business, trading, leaders] = await Promise.all([
    getUserStats(r),
    getRetention(10),
    getDailyBusiness(r),
    getTradingStats(r),
    getTopTradersForAdmin(15),
  ]);

  const tradedShare = users.total ? users.everTraded / users.total : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="משתמשים" value={fmt(users.total)} hint={`+${fmt(users.newInRange)} בטווח`} />
        <Kpi
          label="ביצעו עסקה אי פעם"
          value={`${fmt(tradedShare * 100)}%`}
          tone={tradedShare < 0.5 ? "no" : "yes"}
          hint={`${fmt(users.everTraded)} מתוך ${fmt(users.total)}`}
        />
        <Kpi label="סוחרים פעילים" value={fmt(users.activeTraders)} hint={`${fmt(users.repeatTraders)} עם 2+ עסקאות`} />
        <Kpi label="עסקאות לסוחר" value={fmt(users.avgTradesPerTrader)} hint={`${fmt(users.commenters)} כתבו תגובה`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="נרשמים ליום">
          <BarSeries data={business.map((d) => ({ label: shortDay(d.day), value: d.signups }))} />
        </Card>
        <Card title="נפח מסחר ליום">
          <BarSeries data={business.map((d) => ({ label: shortDay(d.day), value: Math.round(d.volume), hint: `${d.trades} עסקאות` }))} unit=" ₪" />
        </Card>
      </div>

      <Card title="קוהורטות הרשמה" hint="לפי שבוע הרשמה: כמה סחרו וכמה חזרו אחרי יממה">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-right font-medium">שבוע</th>
                <th className="px-3 py-2 text-right font-medium">נרשמו</th>
                <th className="px-3 py-2 text-right font-medium">סחרו</th>
                <th className="px-3 py-2 text-right font-medium">חזרו</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cohorts.map((c) => (
                <tr key={c.week}>
                  <td className="px-3 py-2" dir="ltr">
                    {c.week}
                  </td>
                  <td className="tabular px-3 py-2 font-semibold">{fmt(c.users)}</td>
                  <td className="tabular px-3 py-2">
                    {fmt(c.traded)} <span className="text-xs text-muted-2">({fmt(c.users ? (c.traded / c.users) * 100 : 0)}%)</span>
                  </td>
                  <td className="tabular px-3 py-2">
                    {fmt(c.returned)} <span className="text-xs text-muted-2">({fmt(c.users ? (c.returned / c.users) * 100 : 0)}%)</span>
                  </td>
                </tr>
              ))}
              {!cohorts.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-2">
                    עדיין אין נרשמים.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="מסחר בטווח">
          <dl className="space-y-2 text-sm">
            <Row label="עסקאות" value={fmt(trading.trades)} />
            <Row label="נפח" value={money(trading.volume)} />
            <Row label="עסקה ממוצעת" value={money(trading.avgSize, { decimals: true })} />
            <Row label="העסקה הגדולה" value={money(trading.biggest)} />
            <Row label="קנייה / מכירה" value={`${fmt(trading.buys)} / ${fmt(trading.sells)}`} />
            <Row label="כן / לא" value={`${fmt(trading.yes)} / ${fmt(trading.no)}`} />
            <Row label="שווקים שנסחרו" value={fmt(trading.uniqueMarkets)} />
          </dl>
        </Card>

        <Card title="מובילים" hint="שווי כולל (יתרה + פוזיציות)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">#</th>
                  <th className="px-3 py-2 text-right font-medium">סוחר/ת</th>
                  <th className="px-3 py-2 text-right font-medium">שווי</th>
                  <th className="px-3 py-2 text-right font-medium">רווח/הפסד</th>
                  <th className="px-3 py-2 text-right font-medium">עסקאות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaders.map((l, i) => (
                  <tr key={l.userId}>
                    <td className="tabular px-3 py-2 text-muted">{i + 1}</td>
                    <td className="px-3 py-2">{l.name ?? "אנונימי"}</td>
                    <td className="tabular px-3 py-2 font-semibold">{money(l.netWorth)}</td>
                    <td className={`tabular px-3 py-2 ${l.pnl >= 0 ? "text-yes" : "text-no"}`}>{signedMoney(l.pnl)}</td>
                    <td className="tabular px-3 py-2 text-muted">{l.tradeCount}</td>
                  </tr>
                ))}
                {!leaders.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-2">
                      אין עדיין סוחרים.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-2">כל משתמש מתחיל עם {money(STARTING_BALANCE)} וירטואליים.</p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular font-semibold text-text">{value}</dd>
    </div>
  );
}
