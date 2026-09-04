import { getRecentTrades } from "@/lib/markets";
import { TradeList } from "@/components/TradeList";

export const dynamic = "force-dynamic";
export const metadata = { title: "פעילות" };

export default async function ActivityPage() {
  const trades = await getRecentTrades(null, 100);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">פעילות אחרונה</h1>
        <p className="text-sm text-muted">כל העסקאות בכל השווקים, מהחדשה לישנה.</p>
      </div>
      <div className="card p-3.5 sm:p-4">
        <TradeList trades={trades} showMarket />
      </div>
    </div>
  );
}
