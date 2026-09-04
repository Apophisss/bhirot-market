/**
 * "מצב זריז" — the rapid-fire answering mode.
 *
 * Dependency-free leaf module (like `lmsr.ts` and `format.ts`) so both the client
 * deck and the server route can import it without dragging the database client
 * into the browser bundle. The database query lives in `rapid-feed.ts`.
 *
 * Every answer is a binding BUY on the LMSR market maker, and a single answer is
 * confined to a fixed shekel range so a fast run stays fast and a mis-tap stays
 * cheap. The range is enforced twice: by the slider here, and again by
 * `POST /api/rapid/answer`, which is the only place that actually binds.
 */

export const RAPID_MIN_STAKE = 5;
export const RAPID_MAX_STAKE = 100;
export const RAPID_STAKE_STEP = 5;
export const RAPID_STAKE_PRESETS = [5, 10, 25, 50, 100];
export const RAPID_DEFAULT_STAKE = 20;

/** Nudges any number into the binding range (used by the slider and by the localStorage restore). */
export function clampStake(v: number): number {
  if (!Number.isFinite(v)) return RAPID_DEFAULT_STAKE;
  return Math.min(RAPID_MAX_STAKE, Math.max(RAPID_MIN_STAKE, Math.round(v)));
}

export type RapidSort = "mix" | "closing" | "new" | "hot";

export const RAPID_SORTS: { id: RapidSort; label: string }[] = [
  { id: "mix", label: "מעורבב" },
  { id: "closing", label: "נסגר בקרוב" },
  { id: "new", label: "חדשות" },
  { id: "hot", label: "חמות" },
];

/** One question as the deck needs it — plain data, safe to hand across the RSC boundary. */
export interface RapidCard {
  id: string;
  title: string;
  subtitle: string | null;
  categoryLabel: string;
  categoryEmoji: string;
  categoryAccent: string;
  image: string;
  fallbackImage: string;
  personName: string | null;
  probability: number;
  qYes: number;
  qNo: number;
  liquidity: number;
  /** epoch ms — a Date would survive the RSC boundary but not a future JSON feed endpoint */
  closesAt: number;
  volume: number;
  tradeCount: number;
  byClaude: boolean;
}
