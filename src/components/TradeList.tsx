import Link from "next/link";
import { Avatar } from "./Avatar";
import { money, pct, shares as fmtShares, timeAgo } from "@/lib/format";

export interface TradeItem {
  id: number;
  side: "YES" | "NO";
  action: "BUY" | "SELL";
  shares: number;
  amount: number;
  priceAfter: number;
  createdAt: Date;
  marketId: string;
  marketTitle?: string;
  userName?: string | null;
  userImage?: string | null;
}

export function TradeList({ trades, showMarket = false, showUser = true, emptyText = "עדיין אין עסקאות" }: { trades: TradeItem[]; showMarket?: boolean; showUser?: boolean; emptyText?: string }) {
  if (!trades.length) return <p className="text-sm text-muted-2">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border">
      {trades.map((t) => {
        const sideLabel = t.side === "YES" ? "כן" : "לא";
        const verb = t.action === "BUY" ? "קנה/תה" : "מכר/ה";
        return (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            {showUser && <Avatar name={t.userName} image={t.userImage} size={30} />}
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                {showUser && <span className="font-semibold text-text">{t.userName ?? "אנונימי"}</span>}
                <span className="text-muted">{verb}</span>
                <span className={`font-bold ${t.side === "YES" ? "text-yes" : "text-no"}`}>{fmtShares(t.shares)} {sideLabel}</span>
                <span className="text-muted">ב־</span>
                <span className="tabular font-semibold text-text">{money(t.amount, { decimals: true })}</span>
                <span className="text-muted-2">({pct(t.priceAfter, 1)} אחרי)</span>
              </div>
              {showMarket && t.marketTitle && (
                <Link href={`/market/${t.marketId}`} className="line-clamp-1 text-xs text-accent-2 hover:underline">
                  {t.marketTitle}
                </Link>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-2">{timeAgo(t.createdAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}
