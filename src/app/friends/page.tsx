import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listFriends, listIncomingRequests, listOutgoingRequests, type FriendView } from "@/lib/friends";
import { money, signedMoney, pnlTone, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { StatTile } from "@/components/StatTile";
import { FriendSearch } from "@/components/FriendSearch";
import { PostButton } from "@/components/PostButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "החברים שלי",
  // a personal, login-gated page: never index it
  robots: { index: false, follow: false, nocache: true },
};

/**
 * One friend: their name, their score, and how busy they are. Deliberately no link to
 * their answers — there is no page that would show them, and there is not meant to be
 * one (see `src/lib/social.ts`).
 */
function FriendRow({ f }: { f: FriendView }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={f.name} size={36} image={f.image} seed={f.id} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-text-strong">{f.name ?? "אנונימי"}</div>
        <div className="text-[13px] text-muted">
          {f.openPositions > 0 ? `${f.openPositions} תשובות פתוחות` : "אין תשובות פתוחות"} · {f.tradeCount} תשובות סה״כ ·
          חברים מ־{timeAgo(f.since)}
        </div>
      </div>
      <div className="text-left">
        <div className="tabular font-extrabold text-text-strong">{money(f.netWorth)}</div>
        <div className={`tabular text-[13px] font-bold ${pnlTone(f.pnl)}`}>{signedMoney(f.pnl)}</div>
      </div>
      <PostButton
        endpoint="/api/friends"
        body={{ action: "remove", userId: f.id }}
        label="הסרה"
        tone="danger"
        confirm={`להסיר את ${f.name ?? "החבר/ה"} מרשימת החברים?`}
        className="shrink-0"
      />
    </li>
  );
}

export default async function FriendsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=/friends");

  const [friends, incoming, outgoing] = await Promise.all([
    listFriends(user.id),
    listIncomingRequests(user.id),
    listOutgoingRequests(user.id),
  ]);
  const openTotal = friends.reduce((sum, f) => sum + f.openPositions, 0);
  const best = friends[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">החברים שלי</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted sm:text-sm">
          מוצאים אנשים לפי השם, שולחים בקשת חברות, וברגע שהם מאשרים אתם רואים כמה נקודות יש להם וכמה תשובות פתוחות הם
          מחזיקים. <span className="text-text">על אילו שאלות הם ענו — לא רואים</span>, לאף אחד ובשום מקום. גם הם רואים
          עליכם בדיוק את אותו הדבר.{" "}
          <Link href="/leagues" className="font-semibold text-accent-2 hover:underline">
            רוצים טבלה מסודרת? פתחו ליגה
          </Link>
          .
        </p>
      </div>

      {friends.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          <StatTile label="חברים" value={String(friends.length)} />
          <StatTile
            label="המוביל/ה מביניכם"
            value={best ? money(best.netWorth) : "—"}
            hint={best?.name ?? undefined}
          />
          <StatTile label="תשובות פתוחות אצל החברים" value={String(openTotal)} className="col-span-2 sm:col-span-1" />
        </div>
      )}

      {incoming.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">
            בקשות שממתינות לכם ({incoming.length})
          </h2>
          <ul className="divide-y divide-border">
            {incoming.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={r.name} image={r.image} size={32} seed={r.id} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-text">{r.name ?? "אנונימי"}</div>
                  <div className="text-[13px] text-muted">ביקש/ה {timeAgo(r.askedAt)}</div>
                </div>
                <PostButton endpoint="/api/friends" body={{ action: "accept", userId: r.id }} label="אישור" tone="primary" />
                <PostButton endpoint="/api/friends" body={{ action: "decline", userId: r.id }} label="דחייה" tone="ghost" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <FriendSearch />

      <section className="card overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-bold text-text-strong">הרשימה שלי</h2>
          {friends.length > 1 && <span className="text-[13px] text-muted">לפי ניקוד כולל, מהגבוה לנמוך</span>}
        </div>
        {friends.length > 0 ? (
          <ul className="divide-y divide-border">
            {friends.map((f) => (
              <FriendRow key={f.id} f={f} />
            ))}
          </ul>
        ) : (
          <p className="p-6 text-center text-sm leading-relaxed text-muted">
            עדיין אין לכם חברים כאן. חפשו מישהו למעלה — או{" "}
            <Link href="/invite" className="font-semibold text-accent-2 hover:underline">
              הזמינו חברים לאתר
            </Link>{" "}
            ותקבלו גם בונוס נקודות על כל הרשמה.
          </p>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">בקשות שיצאו מכם</h2>
          <ul className="divide-y divide-border">
            {outgoing.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={r.name} image={r.image} size={32} seed={r.id} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-text">{r.name ?? "אנונימי"}</div>
                  <div className="text-[13px] text-muted">נשלחה {timeAgo(r.askedAt)} · ממתינה לתשובה</div>
                </div>
                <PostButton endpoint="/api/friends" body={{ action: "cancel", userId: r.id }} label="ביטול" tone="ghost" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[13px] leading-relaxed text-muted-2">
        לוח המובילים הכללי נשאר אנונימי — שם אף אחד לא רואה מי אתם. חברות היא החריג המכוון לכך, והיא הדדית: השם, הניקוד
        ומספר התשובות הפתוחות נחשפים רק אחרי שהצד השני אישר, ואפשר להסיר חברות בכל רגע.
      </p>
    </div>
  );
}
