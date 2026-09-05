import { NextResponse } from "next/server";
import { getMarket, getPriceHistory, getRecentTrades } from "@/lib/markets";
import { getChartHistory } from "@/lib/display-history";
import { fakeMarketTrades, mergeTrades } from "@/lib/fake-market-stats";
import { ensureSynced } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await ensureSynced();
  const { slug } = await ctx.params;
  const market = await getMarket(slug);
  if (!market) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  // `history` stays the real, recorded price history — it is a documented public
  // contract and must never contradict recentTrades[].priceAfter. The chart series,
  // which may contain display-only estimated points, ships separately and labelled.
  // recentTrades carries no trader identity — the site does not expose who bet what.
  const [history, recent, chart] = await Promise.all([
    getPriceHistory(slug),
    getRecentTrades(slug, 20),
    getChartHistory(market),
  ]);
  // The feed carries the same numbers and the same list the question's page shows
  // (src/lib/fake-market-stats.ts): a public endpoint that answered with the recorded
  // pair would contradict the page it describes. The internal display fields are
  // stripped rather than published beside them.
  const { displayVolume, displayTradeCount, ...row } = market;
  return NextResponse.json({
    ok: true,
    market: { ...row, volume: displayVolume, tradeCount: displayTradeCount },
    history,
    recentTrades: mergeTrades(recent, fakeMarketTrades(market, 12), 20),
    chartHistory: chart.points,
    chartHistoryMeta: {
      synthetic: chart.synthetic,
      syntheticCount: chart.syntheticCount,
      realCount: chart.realCount,
      recordedCount: chart.recordedCount,
      maxDeviation: chart.maxDeviation,
      generator: chart.generator,
      note: "נקודות עם synthetic=true הן אומדן לתצוגה בלבד ואינן מסחר אמיתי",
    },
  });
}
