import type { Metadata } from "next";
import { getLeaderboard } from "@/lib/portfolio";
import { Avatar } from "@/components/Avatar";
import { money, signedMoney } from "@/lib/format";
import { auth } from "@/lib/auth";
import { SITE_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "לוח המובילים",
  description:
    "מי הכי טוב בחיזוי הבחירות? דירוג הסוחרים של בחירות מרקט לפי שווי תיק כולל — יתרה בכסף וירטואלי בתוספת שווי הפוזיציות הפתוחות במחירי השוק.",
  alternates: { canonical: "/leaderboard" },
  openGraph: { url: "/leaderboard", title: `לוח המובילים | ${SITE_NAME}` },
};

export default async function LeaderboardPage() {
  const [rows, session] = await Promise.all([getLeaderboard(), auth()]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">לוח המובילים</h1>
        <p className="text-[13px] text-muted sm:text-sm">דירוג לפי שווי כולל (יתרה + שווי פוזיציות פתוחות). כולם התחילו עם ₪10,000 וירטואליים.</p>
      </div>
      <div className="card overflow-hidden">
        {rows.length ? (
          <table className="w-full table-fixed text-sm sm:table-auto">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="w-10 px-3 py-2 text-right font-medium sm:w-auto sm:px-4">#</th>
                <th className="px-2 py-2 text-right font-medium sm:px-3">סוחר/ת</th>
                <th className="px-2 py-2 text-right font-medium sm:px-3">שווי כולל</th>
                <th className="px-2 py-2 text-right font-medium sm:px-3">רווח/הפסד</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">עסקאות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={r.userId} className={r.userId === session?.user?.id ? "bg-accent/10" : "hover:bg-surface-2/60"}>
                  <td className={`tabular px-3 py-2.5 sm:px-4 ${i < 3 ? "font-bold text-text-strong" : "text-muted"}`}>{i + 1}</td>
                  <td className="px-2 py-2.5 sm:px-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={r.name} image={r.image} seed={r.userId} size={28} />
                      <span className="truncate font-semibold text-text">{r.name ?? "אנונימי"}</span>
                    </div>
                  </td>
                  <td className="tabular px-2 py-2.5 font-semibold sm:px-3">{money(r.netWorth)}</td>
                  <td className={`tabular px-2 py-2.5 font-semibold sm:px-3 ${r.pnl >= 0 ? "text-yes" : "text-no"}`}>{signedMoney(r.pnl)}</td>
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
