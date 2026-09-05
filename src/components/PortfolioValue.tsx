import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getNetWorth } from "@/lib/portfolio";
import { money, signedMoney, pnlTone } from "@/lib/format";
import { STARTING_BALANCE } from "@/lib/db/schema";

/**
 * The number in the header.
 *
 * It is the whole portfolio — available cash plus what the open positions would
 * fetch if they were sold now — the same "שווי כולל" the portfolio page and the
 * leaderboard rank by. Available cash alone made a purchase read as a loss: ₪5
 * spent took the header from ₪10,000 to ₪9,995 with nothing on screen to show
 * what the ₪5 bought.
 *
 * The two figures were once confused with one another (the header said one number
 * under the word "יתרה" while the trade panel said another under the same word),
 * so the label here is explicit — "שווי כולל", never "יתרה" — and the trade panel
 * keeps "יתרה" for the cash it actually spends from. The P&L sits beside it in
 * green or red from `sm` up, where there is room for it.
 */
export async function PortfolioValue() {
  const user = await currentUser();
  if (!user) return null;
  const netWorth = await getNetWorth(user.id, user.balance);
  const pnl = netWorth - STARTING_BALANCE;
  return (
    <Link
      href="/portfolio"
      data-evt="header-balance"
      className="tap flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-[13px] font-semibold hover:border-border-2 sm:gap-2 sm:px-3 sm:text-sm"
      title={`שווי כולל (יתרה + פוזיציות פתוחות) ${money(netWorth)} · יתרה זמינה ${money(user.balance)}`}
    >
      {/* the full label needs room the phone header does not have */}
      <span className="text-[10px] font-medium text-muted-2 sm:hidden">שווי</span>
      <span className="hidden text-[11px] font-medium text-muted-2 sm:inline">שווי כולל</span>
      <span className="tabular text-text-strong">{money(netWorth)}</span>
      <span className={`tabular hidden text-[11px] sm:inline ${pnlTone(pnl)}`}>{signedMoney(pnl)}</span>
    </Link>
  );
}
