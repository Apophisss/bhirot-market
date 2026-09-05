import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getNetWorth } from "@/lib/portfolio";
import { money } from "@/lib/format";

/** header chip: the whole portfolio (cash + open positions), not just the free cash */
export async function PortfolioValue() {
  const user = await currentUser();
  if (!user) return null;
  const netWorth = await getNetWorth(user.id, user.balance);
  return (
    <Link
      href="/portfolio"
      className="tabular flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] font-semibold text-yes hover:border-border-2 sm:gap-1.5 sm:px-3 sm:text-sm"
      title="שווי התיק שלך: יתרה זמינה בתוספת שווי הפוזיציות הפתוחות"
    >
      <span className="text-muted-2">₪</span>
      {money(netWorth).replace("₪", "")}
    </Link>
  );
}
