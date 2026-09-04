import { getLeaderboard } from "@/lib/portfolio";
import { Avatar } from "@/components/Avatar";
import { money, signedMoney } from "@/lib/format";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "לוח המובילים" };

export default async function LeaderboardPage() {
  const [rows, session] = await Promise.all([getLeaderboard(), auth()]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-text-strong">לוח המובילים</h1>
        <p className="text-sm text-muted">דירוג לפי שווי כולל (יתרה + שווי פוזיציות פתוחות). כולם התחילו עם ₪10,000 וירטואליים.</p>
      </div>
      <div className="card overflow-hidden">
        {rows.length ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-right font-medium">#</th>
                <th className="px-3 py-2 text-right font-medium">סוחר/ת</th>
                <th className="px-3 py-2 text-right font-medium">שווי כולל</th>
                <th className="px-3 py-2 text-right font-medium">רווח/הפסד</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">עסקאות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={r.userId} className={r.userId === session?.user?.id ? "bg-accent/10" : "hover:bg-surface-2/60"}>
                  <td className={`tabular px-4 py-2.5 ${i < 3 ? "font-bold text-text-strong" : "text-muted"}`}>{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.name} image={r.image} size={28} />
                      <span className="font-semibold text-text">{r.name ?? "אנונימי"}</span>
                    </div>
                  </td>
                  <td className="tabular px-3 py-2.5 font-semibold">{money(r.netWorth)}</td>
                  <td className={`tabular px-3 py-2.5 font-semibold ${r.pnl >= 0 ? "text-yes" : "text-no"}`}>{signedMoney(r.pnl)}</td>
                  <td className="tabular hidden px-3 py-2.5 text-muted sm:table-cell">{r.tradeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-sm text-muted">עדיין אין סוחרים בדירוג.</p>
        )}
      </div>
    </div>
  );
}
