import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getLeagueBoard, getLeagueById, getMembership, type LeagueStanding } from "@/lib/leagues";
import { friendsNotIn } from "@/lib/friends";
import { MAX_LEAGUE_MEMBERS } from "@/lib/social";
import { money, signedMoney, pnlTone } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { LeagueInviteCard } from "@/components/LeagueInviteCard";
import { PostButton } from "@/components/PostButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "ליגה",
  // a private board between people who know each other: never index it
  robots: { index: false, follow: false, nocache: true },
};

/**
 * One line of the table, on a phone as much as on a desktop.
 *
 * There is deliberately no management control in here. The owner's "remove" button
 * used to be a sixth column, and on a 390px screen it took the width the names needed:
 * a board of "יונ…", "או…" and "נו…" is not a board. Managing the league lives in its
 * own section below, where a row has room for a name and a button both.
 */
function Row({ r }: { r: LeagueStanding }) {
  return (
    <tr className={r.isMe ? "bg-accent/10" : "hover:bg-surface-2/60"}>
      <td className={`tabular px-3 py-2.5 sm:px-4 ${r.rank <= 3 ? "font-bold text-text-strong" : "text-muted"}`}>
        {r.rank}
      </td>
      <td className="px-2 py-2.5 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={r.name} image={r.image} size={28} seed={r.userId} />
          <span className="truncate font-semibold text-text">{r.name ?? "אנונימי"}</span>
          {r.isMe && (
            <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[13px] font-bold text-accent-2">את/ה</span>
          )}
          {r.isOwner && !r.isMe && <span className="hidden shrink-0 text-[13px] text-muted-2 sm:inline">מנהל/ת</span>}
        </div>
      </td>
      <td className="tabular px-2 py-2.5 font-semibold sm:px-3">{money(r.netWorth)}</td>
      <td className={`tabular px-2 py-2.5 font-semibold sm:px-3 ${pnlTone(r.pnl)}`}>{signedMoney(r.pnl)}</td>
      <td className="tabular hidden px-3 py-2.5 text-muted sm:table-cell">{r.openPositions}</td>
    </tr>
  );
}

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leagueId = Number(id);
  if (!Number.isInteger(leagueId) || leagueId <= 0) notFound();

  const user = await currentUser();
  if (!user) redirect(`/login?callbackUrl=/leagues/${leagueId}`);

  const league = await getLeagueById(leagueId);
  if (!league) notFound();
  const membership = await getMembership(leagueId, user.id);
  // a league is private: someone who is not in it gets the invite landing page, which
  // is the only place that says anything about it without letting them read the board
  if (!membership || membership.status !== "member") redirect(`/l/${league.code}`);

  const board = await getLeagueBoard(leagueId, user.id);
  const isOwner = league.ownerId === user.id;
  const me = board.find((r) => r.isMe);
  const leader = board[0];
  const invitable = board.length < MAX_LEAGUE_MEMBERS ? await friendsNotIn(user.id, board.map((r) => r.userId)) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/leagues" className="text-[13px] text-muted hover:text-accent-2">
            ← כל הליגות שלי
          </Link>
          <h1 className="mt-1 truncate text-xl font-extrabold text-text-strong sm:text-2xl">{league.name}</h1>
          <p className="text-[13px] text-muted sm:text-sm">
            {board.length} משתתפים · מדורגים לפי ניקוד כולל (נקודות פנויות + מה שיתקבל על התשובות הפתוחות במכירה עכשיו)
            {me ? ` · אתם במקום ${me.rank}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {isOwner ? (
            <PostButton
              endpoint="/api/leagues"
              body={{ action: "delete", leagueId }}
              label="מחיקת הליגה"
              tone="danger"
              confirm={`למחוק את "${league.name}"? הטבלה תיעלם לכל המשתתפים.`}
              navigate
            />
          ) : (
            <PostButton
              endpoint="/api/leagues"
              body={{ action: "leave", leagueId }}
              label="יציאה מהליגה"
              tone="ghost"
              confirm={`לצאת מ"${league.name}"?`}
              navigate
            />
          )}
        </div>
      </div>

      {leader && board.length > 1 && (
        <p className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-text">
          מוביל/ה כרגע: <strong className="text-text-strong">{leader.name ?? "אנונימי"}</strong> עם{" "}
          <strong className="tabular">{money(leader.netWorth)}</strong>
          {me && me.rank > 1 ? (
            <> — {money(leader.netWorth - me.netWorth)} מעליכם.</>
          ) : (
            <>.</>
          )}
        </p>
      )}

      <div className="card overflow-hidden">
        <table className="w-full table-fixed text-sm sm:table-auto">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="w-10 px-3 py-2 text-right font-medium sm:w-auto sm:px-4">#</th>
              <th className="px-2 py-2 text-right font-medium sm:px-3">שחקן/ית</th>
              <th className="px-2 py-2 text-right font-medium sm:px-3">ניקוד כולל</th>
              <th className="px-2 py-2 text-right font-medium sm:px-3">רווח/הפסד</th>
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell" title="כמה שאלות פתוחות הם מחזיקים — לא אילו">
                תשובות פתוחות
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {board.map((r) => (
              <Row key={r.userId} r={r} />
            ))}
          </tbody>
        </table>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">הזמנה לליגה</h2>
        <div className="space-y-4 p-4">
          <LeagueInviteCard code={league.code} name={league.name} />
          {invitable.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-bold text-text-strong">חברים שאפשר להזמין ישירות</h3>
              <ul className="mt-2 divide-y divide-border">
                {invitable.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={f.name} image={f.image} size={30} seed={f.id} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{f.name ?? "אנונימי"}</span>
                    <PostButton
                      endpoint="/api/leagues"
                      body={{ action: "invite", leagueId, userId: f.id }}
                      label="הזמנה"
                      doneLabel="הוזמנו ✓"
                      tone="soft"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {isOwner && board.length > 1 && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">ניהול המשתתפים</h2>
          <ul className="divide-y divide-border">
            {board
              .filter((r) => !r.isMe)
              .map((r) => (
                <li key={r.userId} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={r.name} image={r.image} size={30} seed={r.userId} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{r.name ?? "אנונימי"}</span>
                  <PostButton
                    endpoint="/api/leagues"
                    body={{ action: "remove", leagueId, userId: r.userId }}
                    label="הסרה"
                    tone="danger"
                    confirm={`להסיר את ${r.name ?? "המשתתף/ת"} מהליגה?`}
                    className="shrink-0"
                  />
                </li>
              ))}
          </ul>
        </section>
      )}

      <p className="text-[13px] leading-relaxed text-muted-2">
        הטבלה מציגה ניקוד, רווח/הפסד ומספר התשובות הפתוחות של כל משתתף/ת. <span className="text-muted">אילו</span> שאלות
        מישהו ענה — לא מוצג כאן ולא בשום מקום אחר באתר. הניקוד מחושב בדיוק כמו בלוח המובילים הכללי.
      </p>
    </div>
  );
}
