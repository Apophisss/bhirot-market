import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboard } from "@/lib/portfolio";
import { getMarketStats } from "@/lib/markets";
import { STARTING_BALANCE } from "@/lib/limits";
import { buildBoard, type BoardRow } from "@/lib/fake-leaderboard";
import { Avatar } from "@/components/Avatar";
import { money, signedMoney, pnlTone } from "@/lib/format";
import { auth } from "@/lib/auth";
import { SITE_NAME } from "@/lib/config";
import { shareCard } from "@/lib/seo";

const LEADERBOARD_DESCRIPTION =
  "מי הכי טוב בחיזוי הבחירות? הדירוג האנונימי של בחירות מרקט לפי שווי תיק כולל — יתרה בכסף וירטואלי בתוספת מה שיתקבל על הפוזיציות הפתוחות אם יימכרו עכשיו. בלי שמות, בלי תמונות.";

/** how many rows the table shows before the visitor's own row is pinned below */
const VISIBLE = 100;

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "לוח המובילים",
  description: LEADERBOARD_DESCRIPTION,
  alternates: { canonical: "/leaderboard" },
  ...shareCard({ title: `לוח המובילים | ${SITE_NAME}`, description: LEADERBOARD_DESCRIPTION, path: "/leaderboard" }),
};

function Row({ r, muteRank = false }: { r: BoardRow; muteRank?: boolean }) {
  return (
    <tr className={r.isMe ? "bg-accent/10" : "hover:bg-surface-2/60"}>
      <td className={`tabular px-3 py-2.5 sm:px-4 ${r.rank <= 3 && !muteRank ? "font-bold text-text-strong" : "text-muted"}`}>{r.rank}</td>
      <td className="px-2 py-2.5 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={r.handle} seed={r.handle} size={28} />
          <span className="truncate font-semibold text-text">{r.handle}</span>
          {r.isMe ? <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent-2">את/ה</span> : null}
        </div>
      </td>
      <td className="tabular px-2 py-2.5 font-semibold sm:px-3">{money(r.netWorth)}</td>
      <td className={`tabular px-2 py-2.5 font-semibold sm:px-3 ${pnlTone(r.pnl)}`}>{signedMoney(r.pnl)}</td>
      <td className="tabular hidden px-3 py-2.5 text-muted sm:table-cell">{r.tradeCount}</td>
    </tr>
  );
}

export default async function LeaderboardPage() {
  const [real, session, stats] = await Promise.all([getLeaderboard(), auth(), getMarketStats()]);
  // Nothing on the board has been decided yet, so every gain in it is the
  // revaluation of an open position — and in a market a single trade can move by
  // tens of points, that is a measure of who traded a thin question, not of who
  // was right. Saying so is the difference between a ranking and a scoreboard.
  const provisional = stats.resolved === 0;
  // identities stop here: buildBoard turns each trader into a pseudonym, and only
  // the pseudonymous rows are handed to the markup
  const board = buildBoard(real, { meId: session?.user?.id });
  const rows = board.slice(0, VISIBLE);
  const me = board.find((r) => r.isMe);
  const mePinned = me && me.rank > VISIBLE ? me : null;
  // where a brand-new account would land: everyone still on their starting balance
  // ranks alongside it, so this is the first place a fresh trader could hold
  const newcomerRank = board.filter((r) => r.netWorth > STARTING_BALANCE).length + 1;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">לוח המובילים</h1>
        <p className="text-[13px] text-muted sm:text-sm">
          דירוג לפי שווי כולל (יתרה + מה שיתקבל על הפוזיציות הפתוחות במכירה עכשיו). כולם התחילו עם ₪10,000 וירטואליים; בונוס ההזמנות נספר
          בשווי אבל לא ברווח/הפסד, שמודד חיזוי בלבד.{" "}
          <span className="text-text">הלוח אנונימי</span> — כל סוחר/ת מופיע/ה בכינוי אקראי וקבוע, בלי שם ובלי תמונה.
        </p>
      </div>

      {provisional && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] leading-relaxed text-text">
          <strong>טרם הוכרעו שווקים · הדירוג זמני.</strong> כל רווח בלוח הוא כרגע שערוך של פוזיציות פתוחות ולא רווח ממומש, ובשוק דק
          עסקה בודדת מזיזה את השערוך בעשרות נקודות. ברגע שיוכרעו שאלות ראשונות יופיע כאן גם דיוק ההכרעות — אחוז הפעמים שבהן צדקתם.
        </p>
      )}

      {/* a signed-out visitor has no row, so the board says nothing about them —
          this is the one line that makes it worth reading before signing up */}
      {!session?.user && (
        <p className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-text">
          אילו נרשמתם עכשיו הייתם נכנסים למקום <strong className="tabular">{newcomerRank}</strong> מתוך {board.length}, עם{" "}
          {money(STARTING_BALANCE)} וירטואליים.{" "}
          <Link href="/login?callbackUrl=%2Fleaderboard" className="inline-flex min-h-11 min-w-11 items-center justify-center font-bold text-accent-2 hover:underline">
            להתחיל
          </Link>
        </p>
      )}
      <div className="card overflow-hidden">
        {rows.length ? (
          <table className="w-full table-fixed text-sm sm:table-auto">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="w-10 px-3 py-2 text-right font-medium sm:w-auto sm:px-4">#</th>
                <th className="px-2 py-2 text-right font-medium sm:px-3">סוחר/ת</th>
                <th className="px-2 py-2 text-right font-medium sm:px-3">שווי כולל</th>
                <th className="px-2 py-2 text-right font-medium sm:px-3" title={provisional ? "שערוך פוזיציות פתוחות — אף שוק לא הוכרע עדיין" : undefined}>
                  {provisional ? "שערוך" : "רווח/הפסד"}
                </th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">עסקאות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <Row key={r.rank} r={r} />
              ))}
              {mePinned ? (
                <>
                  <tr className="bg-surface-2/60">
                    <td colSpan={5} className="px-3 py-1.5 text-center text-[11px] text-muted sm:px-4">
                      ⋯ המקום שלך מתוך {board.length} סוחרים ⋯
                    </td>
                  </tr>
                  <Row r={mePinned} muteRank />
                </>
              ) : null}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-sm text-muted">עדיין אין סוחרים בדירוג.</p>
        )}
      </div>
      <p className="text-[12px] text-muted">
        מוצגים {rows.length} המקומות הראשונים מתוך {board.length} סוחרים בלוח. הדירוג מתעדכן בכל טעינה של הדף.
      </p>
    </div>
  );
}
