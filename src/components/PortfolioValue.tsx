import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getNetWorth } from "@/lib/portfolio";
import { money, signedMoney, pnlTone } from "@/lib/format";
import { STARTING_BALANCE } from "@/lib/db/schema";

/**
 * The number in the header.
 *
 * It used to be net worth — cash plus the mark-to-market value of open positions —
 * while the trade panel three centimetres below it showed available cash under the
 * word "יתרה". Two different figures, in the same typeface, on the same screen: a
 * ₪5 purchase moved one from ₪9,105 to ₪9,100 and left the other on ₪10,000, so
 * the header looked stuck.
 *
 * It is now the same available balance the trade panel spends from, labelled, with
 * the overall P&L beside it in green or red — the header's job is to say what can
 * be bet and whether it is going well, and both change on every trade.
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
      title={`יתרה זמינה ${money(user.balance)} · שווי כולל (יתרה + פוזיציות פתוחות) ${money(netWorth)}`}
    >
      <span className="text-[10px] font-medium text-muted-2 sm:text-[11px]">יתרה</span>
      <span className="tabular text-text-strong">{money(user.balance)}</span>
      <span className={`tabular hidden text-[11px] sm:inline ${pnlTone(pnl)}`}>{signedMoney(pnl)}</span>
    </Link>
  );
}
