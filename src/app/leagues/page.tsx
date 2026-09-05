import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listLeagueInvites, listMyLeagues } from "@/lib/leagues";
import { MAX_LEAGUE_MEMBERS } from "@/lib/social";
import { CreateLeagueForm, JoinLeagueForm } from "@/components/LeagueForms";
import { PostButton } from "@/components/PostButton";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "הליגות שלי",
  // personal, login-gated page: never index it
  robots: { index: false, follow: false, nocache: true },
};

export default async function LeaguesPage() {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=/leagues");

  const [leagues, invites] = await Promise.all([listMyLeagues(user.id), listLeagueInvites(user.id)]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">הליגות שלי</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted sm:text-sm">
          ליגה היא טבלה פרטית בין אנשים שמכירים: פותחים ליגה, מזמינים{" "}
          <Link href="/friends" className="font-semibold text-accent-2 hover:underline">
            חברים
          </Link>{" "}
          או שולחים את הקישור, וכל אחד רואה מי מוביל, בכמה נקודות ובאיזה מקום. גם כאן{" "}
          <span className="text-text">רואים ניקוד — לא רואים על אילו שאלות מישהו ענה</span>. עד {MAX_LEAGUE_MEMBERS}{" "}
          משתתפים בליגה.
        </p>
      </div>

      {invites.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">הזמנות שממתינות לכם</h2>
          <ul className="divide-y divide-border">
            {invites.map((inv) => (
              <li key={inv.leagueId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-text-strong">{inv.name}</div>
                  <div className="text-[13px] text-muted">
                    {inv.invitedBy ? `${inv.invitedBy} הזמינו אתכם` : "הזמנה"} · {inv.members} משתתפים ·{" "}
                    {timeAgo(inv.invitedAt)}
                  </div>
                </div>
                <PostButton
                  endpoint="/api/leagues"
                  body={{ action: "accept", leagueId: inv.leagueId }}
                  label="הצטרפות"
                  tone="primary"
                  navigate
                />
                <PostButton
                  endpoint="/api/leagues"
                  body={{ action: "decline", leagueId: inv.leagueId }}
                  label="לא תודה"
                  tone="ghost"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">
          {leagues.length > 0 ? `${leagues.length} ליגות` : "הליגות שלי"}
        </h2>
        {leagues.length > 0 ? (
          <ul className="divide-y divide-border">
            {leagues.map((l) => (
              <li key={l.id}>
                <Link href={`/leagues/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-text-strong">
                      {l.name}
                      {l.isOwner && (
                        <span className="ms-2 rounded-full bg-accent/15 px-2 py-0.5 text-[13px] font-bold text-accent-2">
                          פתחתם אותה
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-muted">{l.members} משתתפים</div>
                  </div>
                  {l.myRank && (
                    <div className="shrink-0 text-left">
                      <div className="tabular text-lg font-extrabold text-text-strong">מקום {l.myRank}</div>
                      <div className="text-[13px] text-muted">מתוך {l.members}</div>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-6 text-center text-sm text-muted">עדיין אין לכם ליגה. פתחו אחת למטה — זה לוקח שנייה.</p>
        )}
      </section>

      <section className="card space-y-5 p-4 sm:p-5">
        <CreateLeagueForm />
        <div className="border-t border-border pt-4">
          <JoinLeagueForm />
        </div>
      </section>
    </div>
  );
}
