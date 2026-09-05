import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getPortfolio, getUserTrades, getLeaderboard, type HoldingView } from "@/lib/portfolio";
import { getReferralSummary } from "@/lib/referral-program";
import { buildBoard } from "@/lib/fake-leaderboard";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { money, signedMoney, signedPct, pct, shares as fmtShares, sharePrice, closesLabel, pnlSign, pnlTone } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import { TradeList } from "@/components/TradeList";
import { InviteCard } from "@/components/InviteCard";
import { BoltIcon } from "@/components/BoltIcon";
import { SurveyPrompt } from "@/components/SurveyPrompt";
import { shouldOfferSurvey } from "@/lib/survey-offer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "הניקוד שלי",
  // personal, login-gated page: never index it
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The tooltip behind every value cell. The column is the sale proceeds, not
 * shares × price, so it is worth saying why the two differ: selling walks the
 * price down, and the average the sale actually gets is the honest number.
 */
function sellHint(h: HoldingView): string {
  return `מכירה של ${fmtShares(h.shares)} תשובות עכשיו מזכה ב־${money(h.value, { decimals: true })} — ${sharePrice(h.exitPrice)} לתשובה בממוצע. המחיר הנוכחי (${pct(h.currentPrice, 1)}) הוא מחיר התשובה הבאה; מכירה גדולה מורידה אותו תוך כדי.`;
}

export default async function PortfolioPage() {
  const user = await currentUser();
  if (!user) redirect("/login?callbackUrl=/portfolio");
  const [{ holdings, openHoldings, positionsValue, unrealized, realized }, trades, referrals, ranked, askSurvey] =
    await Promise.all([
      getPortfolio(user.id),
      getUserTrades(user.id),
      getReferralSummary(user.id),
      getLeaderboard(),
      shouldOfferSurvey(user.id),
    ]);
  // the leaderboard is not in the site navigation — the profile is the way in,
  // so the link carries the one number that makes it worth following
  const board = buildBoard(ranked, { meId: user.id });
  const myRank = board.find((r) => r.isMe)?.rank ?? null;
  const netWorth = user.balance + positionsValue;
  // invite bonuses are capital, not performance: they raise the balance but never the P&L
  const capital = STARTING_BALANCE + referrals.earned;
  const totalPnl = netWorth - capital;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-xl font-extrabold text-text-strong sm:text-2xl">הניקוד של {user.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/leaderboard"
            data-evt="portfolio-leaderboard"
            className="pressable inline-flex items-center rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-text hover:border-accent hover:text-accent-2"
          >
            לוח המובילים{myRank ? ` · מקום ${myRank}` : ""}
          </Link>
          <Link
            href="/rapid"
            className="pressable inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-bold text-accent-2 hover:bg-accent/20"
          >
            <BoltIcon />
            סבב זריז
          </Link>
        </div>
      </div>
      {/* משתמש ותיק מגיע לכאן גם כשהוא לא עובר בדף הבית — ההצעה למלא את השאלון הולכת אחריו */}
      {askSurvey && <SurveyPrompt next="/portfolio" />}

      {/*
        The P&L is the only number here that moves when something happens, so it is
        the one the page leads with — at twice the size of the rest and with the
        percentage beside the shekels. "שווי כולל" opened the page for a long time
        and was the least informative tile on it: it reads 10,000 next to
        "התחלת עם 10,000" for every user who has not answered anything, and barely moves for
        one who has. It is now a sub-line under the number it is the base of.
      */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatTile
          size="hero"
          className="col-span-2"
          label="רווח/הפסד כולל"
          value={signedMoney(totalPnl)}
          badge={pnlSign(totalPnl) === 0 ? undefined : signedPct(totalPnl / capital)}
          tone={pnlTone(totalPnl)}
          hint={`ממומש ${signedMoney(realized)} · לא ממומש ${signedMoney(unrealized)} · שווי כולל ${money(netWorth)}`}
        />
        <StatTile
          label="יתרה זמינה"
          value={money(user.balance)}
          hint={`מתוך ${money(capital)}${referrals.earned > 0 ? " (כולל בונוס הזמנות)" : " שהתחלת איתם"}`}
        />
        <StatTile
          label="שווי תשובות פתוחות"
          value={money(positionsValue)}
          hint={`מה שתקבלו אם תמכרו הכול עכשיו · לא ממומש ${signedMoney(unrealized)}`}
          tone={pnlTone(unrealized)}
        />
      </div>

      <InviteCard code={referrals.code} invited={referrals.invited} earned={referrals.earned} remaining={referrals.remaining} />

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">תשובות פתוחות ({openHoldings.length})</h2>
        {openHoldings.length ? (
          <>
            <ul className="divide-y divide-border sm:hidden">
              {openHoldings.map((h) => (
                <li key={`${h.market.id}-${h.side}-m`} className="p-3.5">
                  <Link href={`/market/${h.market.id}`} className="line-clamp-2 text-sm font-semibold text-text hover:text-accent-2">
                    {h.market.title}
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className={`rounded-md px-2 py-1 font-bold ${h.side === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}>
                      {h.side === "YES" ? "כן" : "לא"} · {fmtShares(h.shares)} תשובות
                    </span>
                    <span className={`tabular font-bold ${pnlTone(h.pnl)}`}>{signedMoney(h.pnl)}</span>
                  </div>
                  <div className="tabular mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                    <span title={sellHint(h)}>
                      ממוצע {sharePrice(h.avgPrice)} · נוכחי {pct(h.currentPrice, 1)} · במכירה {money(h.value, { decimals: true })}
                      {/* when the question decides is what brings a holder back to it */}
                      {h.market.status === "open" && <span className="text-muted-2"> · {closesLabel(h.market.closesAt)}</span>}
                    </span>
                    <Link
                      href={`/market/${h.market.id}?side=${h.side.toLowerCase()}&action=sell#trade`}
                      className="pressable shrink-0 rounded-md border border-border-2 px-3 py-1.5 font-semibold text-text"
                    >
                      סחר
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">שאלה</th>
                  <th className="px-3 py-2 text-right font-medium">צד</th>
                  <th className="px-3 py-2 text-right font-medium">תשובות</th>
                  <th className="px-3 py-2 text-right font-medium">מחיר ממוצע</th>
                  <th className="px-3 py-2 text-right font-medium">מחיר נוכחי</th>
                  <th className="px-3 py-2 text-right font-medium" title="מה שתקבלו אם תמכרו את התשובות עכשיו">שווי במכירה</th>
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
                    <td className="tabular px-3 py-2.5">{sharePrice(h.avgPrice)}</td>
                    <td className="tabular px-3 py-2.5">{pct(h.currentPrice, 1)}</td>
                    <td className="tabular px-3 py-2.5 font-semibold" title={sellHint(h)}>{money(h.value, { decimals: true })}</td>
                    <td className={`tabular px-3 py-2.5 font-semibold ${pnlTone(h.pnl)}`}>{signedMoney(h.pnl)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/market/${h.market.id}?side=${h.side.toLowerCase()}&action=sell#trade`} className="rounded-md border border-border px-2 py-1 text-xs hover:border-border-2">לשאלה</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <p className="p-6 text-center text-sm text-muted">
            אין תשובות פתוחות. התחילו <Link href="/rapid" className="text-accent-2 hover:underline">במצב זריז</Link> או{" "}
            <Link href="/" className="text-accent-2 hover:underline">בחרו שאלה מהרשימה</Link>.
          </p>
        )}
      </section>

      {holdings.some((h) => h.settled) && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 font-bold text-text-strong">שאלות שהוכרעו</h2>
          <ul className="divide-y divide-border text-sm">
            {holdings
              .filter((h) => h.settled)
              .map((h) => (
                <li key={`${h.market.id}-${h.side}-s`} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <Link href={`/market/${h.market.id}`} className="line-clamp-2 text-text hover:text-accent-2 sm:line-clamp-1">{h.market.title}</Link>
                  <span className="shrink-0 text-xs text-muted">
                    <span className={h.side === "YES" ? "text-yes" : "text-no"}>{fmtShares(h.shares)} {h.side === "YES" ? "כן" : "לא"}</span> · תוצאה:{" "}
                    {h.market.status === "cancelled" ? "בוטל" : h.market.resolution === "YES" ? "כן" : "לא"} ·{" "}
                    <span className={`tabular font-semibold ${pnlTone(h.realizedPnl)}`}>{signedMoney(h.realizedPnl)}</span>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="card p-3.5 sm:p-4">
        <h2 className="mb-2 font-bold text-text-strong">היסטוריית תשובות</h2>
        <TradeList trades={trades} showMarket emptyText="עדיין לא ענית על שאלות" />
      </section>
    </div>
  );
}
