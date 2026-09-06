/**
 * The only place where the real price history and the fabricated one meet, and
 * the only place the synthetic-history configuration is read from the environment.
 *
 * Server-only: it touches the database and process.env. `getPriceHistory` stays
 * the raw-truth accessor (use it for anything that is not a picture);
 * `getChartHistory` is the display series.
 */
import { getPriceHistory, getPriceHistoryMany, type MarketView } from "./markets";
import {
  buildDisplayHistory,
  DEFAULT_SYNTH_CONFIG,
  SYNTH_HARD_MAX_DEVIATION,
  type DisplayHistory,
  type SynthConfig,
} from "./synthetic-history";

const DAY = 86_400_000;

/** Parse-and-clamp: a bad value falls back to the default, a large one is capped. No env var can widen a bound. */
function numEnv(raw: string | undefined, fallback: number, lo: number, hi: number): number {
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function resolveConfig(): SynthConfig {
  const maxWindowMs = numEnv(process.env.SYNTHETIC_HISTORY_WINDOW_DAYS, 30, 0, 120) * DAY;
  return {
    ...DEFAULT_SYNTH_CONFIG,
    enabled: process.env.SYNTHETIC_HISTORY !== "off",
    maxDeviation: numEnv(process.env.SYNTHETIC_HISTORY_MAX_DEV, DEFAULT_SYNTH_CONFIG.maxDeviation, 0, SYNTH_HARD_MAX_DEVIATION),
    fillGaps: process.env.SYNTHETIC_HISTORY_FILL_GAPS !== "off",
    maxWindowMs,
    minWindowMs: Math.min(DEFAULT_SYNTH_CONFIG.minWindowMs, maxWindowMs),
    seedSalt: process.env.SYNTHETIC_HISTORY_SALT || DEFAULT_SYNTH_CONFIG.seedSalt,
  };
}

/** Resolved once per server instance — the env does not change under a running process. */
let cached: SynthConfig | null = null;
export function synthConfig(): SynthConfig {
  if (!cached) cached = resolveConfig();
  return cached;
}

/*
 * The provenance flags leave here intact, and that is the point of this module.
 *
 * There used to be an `asTraded()` between the builder and the callers: it stripped
 * `synthetic` off every point, zeroed `syntheticCount` and nulled `opensAt`, so the
 * fabricated prefix reached `PriceChart` and `RapidSpark` indistinguishable from
 * recorded trading and was drawn as one solid, traded curve. Both components already
 * knew how to draw an estimate — the dashed stroke, the hatched fill, the "אומדן"
 * label over the prefix, the "פתיחת השאלה" divider — and none of it could ever fire.
 *
 * Meanwhile /about §9 tells every reader, in as many words, that the site draws
 * "קו מקווקו של אומדן" before the opening and that "כל מה שמימין לקו הפתיחה הוא נתון
 * אמיתי". A promise the product cannot keep is worse than a flat chart: it is the
 * one claim on that page a visitor can check in five seconds. So the flags stay, and
 * the estimate is visible for as long as it is there — `buildDisplayHistory` retires
 * the fabrication on its own once a market has `retireAtTrades` real trades
 * (src/lib/synthetic-history.ts), which is what makes the label self-clearing rather
 * than something a screen has to remember to stop showing.
 */

/**
 * The series the chart draws: every real price_history row, verbatim, plus
 * display-only fabricated points that never stray further from the recorded
 * price than the configured cap. Never written back to the database.
 */
export async function getChartHistory(market: MarketView, now = Date.now()): Promise<DisplayHistory> {
  const real = await getPriceHistory(market.id);
  return buildDisplayHistory(
    {
      marketId: market.id,
      real,
      probability: market.probability,
      closesAt: market.closesAt.getTime(),
      status: market.status,
      tradeCount: market.tradeCount,
      now,
    },
    synthConfig(),
  );
}

/**
 * `getChartHistory` for a whole feed, in one database round trip — every market gets
 * exactly the series it would have got on its own page, built against a single clock
 * so two cards in the same deck cannot disagree about "now".
 */
export async function getChartHistories(list: MarketView[], now = Date.now()): Promise<Map<string, DisplayHistory>> {
  const real = await getPriceHistoryMany(list.map((m) => m.id));
  const cfg = synthConfig();
  const out = new Map<string, DisplayHistory>();
  for (const m of list) {
    out.set(
      m.id,
      buildDisplayHistory(
        {
          marketId: m.id,
          real: real.get(m.id) ?? [],
          probability: m.probability,
          closesAt: m.closesAt.getTime(),
          status: m.status,
          tradeCount: m.tradeCount,
          now,
        },
        cfg,
      ),
    );
  }
  return out;
}
