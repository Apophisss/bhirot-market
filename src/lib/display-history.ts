/**
 * The only place where the real price history and the fabricated one meet, and
 * the only place the synthetic-history configuration is read from the environment.
 *
 * Server-only: it touches the database and process.env. `getPriceHistory` stays
 * the raw-truth accessor (use it for anything that is not a picture);
 * `getChartHistory` is the display series.
 */
import { getPriceHistory, type MarketView } from "./markets";
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

/**
 * The series the chart draws: every real price_history row, verbatim, plus
 * display-only fabricated points that never stray further from the recorded
 * price than `result.maxDeviation`. Never written back to the database.
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
