import { NextResponse } from "next/server";
import { getMarket, getPriceHistory, getRecentTrades } from "@/lib/markets";
import { getChartHistory } from "@/lib/display-history";
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
  // Recorded numbers, and only recorded numbers. This endpoint used to publish the
  // display pair (src/lib/fake-market-stats.ts) so that it would agree with the page
  // — but the page has stopped printing that pair where it would be misleading, and
  // an endpoint that a journalist, a competitor or an LLM agent can diff against
  // /admin is the last place to inflate anything. The internal display fields are
  // stripped rather than published.
  const { displayVolume: _dv, displayTradeCount: _dtc, ...row } = market;
  return NextResponse.json({
    ok: true,
    market: row,
    history,
    recentTrades: recent,
    chartHistory: chart.points,
    chartHistoryMeta: {
      synthetic: chart.synthetic,
      syntheticCount: chart.syntheticCount,
      realCount: chart.realCount,
      recordedCount: chart.recordedCount,
      maxDeviation: chart.maxDeviation,
      generator: chart.generator,
      note: "נקודות עם synthetic=true הן אומדן לתצוגה בלבד ואינן תשובות אמיתיות",
    },
  });
}
