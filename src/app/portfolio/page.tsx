import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getPortfolio, getUserTrades } from "@/lib/portfolio";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { money, signedMoney, pct, shares as fmtShares, agora } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import { TradeList } from "@/components/TradeList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "התיק שלי",
  // personal, login-gated page: never index it
  robots: { index: false, follow: false, nocache: true },
};

export default async function PortfolioPage() {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=/portfolio");
  const [{ holdings, openHoldings, positionsValue, unrealized, realized }, trades] = await Promise.all([
    getPortfolio(user.id),
    getUserTrades(user.id),
  ]);
  const netWorth = user.balance + positionsValue;
  const totalPnl = netWorth - STARTING_BALANCE;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-text-strong">התיק של {user.name}</h1>
        <Link
          href="/rapid"
          className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-bold text-accent-2 hover:bg-accent/20"
        >
          סבב זריז
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="שווי כולל" value={money(netWorth)} hint={`התחלת עם ${money(STARTING_BALANCE)}`} />
        <StatTile label="רווח/הפסד כולל" value={signedMoney(totalPnl)} tone={totalPnl >= 0 ? "yes" : "no"} hint={`ממומש ${signedMoney(realized)}`} />
        <StatTile label="יתרה זמינה" value={money(user.balance)} />
        <StatTile label="שווי פוזיציות פתוחות" value={money(positionsValue)} hint={`לא ממומש ${signedMoney(unrealized)}`} tone={unrealized >= 0 ? "yes" : "no"} />
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">פוזיציות פתוחות ({openHoldings.length})</h2>
        {openHoldings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">שוק</th>
                  <th className="px-3 py-2 text-right font-medium">צד</th>
                  <th className="px-3 py-2 text-right font-medium">מניות</th>
                  <th className="px-3 py-2 text-right font-medium">מחיר ממוצע</th>
                  <th className="px-3 py-2 text-right font-medium">מחיר נוכחי</th>
                  <th className="px-3 py-2 text-right font-medium">שווי</th>
                  <th className="px-3 py-2 text-right font-medium">רווח/הפסד</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {openHoldings.map((h) => (
                  <tr key={`${h.market.id}-${h.side}`} className="hover:bg-surface-2/60">
                    <td className="max-w-md px-4 py-2.5">
                      <Link href={`/market/${h.market.id}`} className="line-clamp-2 font-medium text-text hover:text-accent-2">{h.market.title}</Link>
                    </td>
                    <td className={`px-3 py-2.5 font-bold ${h.side === "YES" ? "text-yes" : "text-no"}`}>{h.side === "YES" ? "כן" : "לא"}</td>
                    <td className="tabular px-3 py-2.5">{fmtShares(h.shares)}</td>
                    <td className="tabular px-3 py-2.5">{agora(h.avgPrice)}</td>
                    <td className="tabular px-3 py-2.5">{pct(h.currentPrice, 1)}</td>
                    <td className="tabular px-3 py-2.5 font-semibold">{money(h.value, { decimals: true })}</td>
                    <td className={`tabular px-3 py-2.5 font-semibold ${h.pnl >= 0 ? "text-yes" : "text-no"}`}>{signedMoney(h.pnl)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/market/${h.market.id}?side=${h.side.toLowerCase()}`} className="rounded-md border border-border px-2 py-1 text-xs hover:border-border-2">סחר</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-muted">
            אין פוזיציות פתוחות. התחילו <Link href="/rapid" className="text-accent-2 hover:underline">במצב זריז</Link> או{" "}
            <Link href="/" className="text-accent-2 hover:underline">בחרו שוק מהרשימה</Link>.
          </p>
        )}
      </section>

      {holdings.some((h) => h.settled) && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">שווקים שהוכרעו</h2>
          <ul className="divide-y divide-border text-sm">
            {holdings
              .filter((h) => h.settled)
              .map((h) => (
                <li key={`${h.market.id}-${h.side}-s`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/market/${h.market.id}`} className="line-clamp-1 text-text hover:text-accent-2">{h.market.title}</Link>
                  <span className="shrink-0 text-xs text-muted">
                    <span className={h.side === "YES" ? "text-yes" : "text-no"}>{fmtShares(h.shares)} {h.side === "YES" ? "כן" : "לא"}</span> · תוצאה:{" "}
                    {h.market.status === "cancelled" ? "בוטל" : h.market.resolution === "YES" ? "כן" : "לא"} ·{" "}
                    <span className={`tabular font-semibold ${h.realizedPnl >= 0 ? "text-yes" : "text-no"}`}>{signedMoney(h.realizedPnl)}</span>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-2 font-bold text-text-strong">היסטוריית עסקאות</h2>
        <TradeList trades={trades} showMarket showUser={false} emptyText="עדיין לא ביצעת עסקאות" />
      </section>
    </div>
  );
}
