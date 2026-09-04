import Link from "next/link";
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
}

/** Renders the signed-in user's own trades only — trades are never attributed to other users. */
export function TradeList({ trades, showMarket = false, emptyText = "עדיין אין עסקאות" }: { trades: TradeItem[]; showMarket?: boolean; emptyText?: string }) {
  if (!trades.length) return <p className="text-sm text-muted-2">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border">
      {trades.map((t) => {
        const sideLabel = t.side === "YES" ? "כן" : "לא";
        const verb = t.action === "BUY" ? "קנה/תה" : "מכר/ה";
        return (
          <li key={t.id} className="flex items-start gap-2.5 py-3 sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1 text-[13px] sm:text-sm">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
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
            <span className="shrink-0 pt-0.5 text-[11px] text-muted-2 sm:pt-0 sm:text-xs">{timeAgo(t.createdAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}
