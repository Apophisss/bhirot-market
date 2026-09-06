/**
 * The board, held in memory for a few seconds at a time.
 *
 * The home page and the category pages are `force-dynamic`, and every one of them used
 * to rebuild the whole board from SQLite on every request: a full read of every open
 * market, a second full read for the recommendation pool, and two more scans for the
 * category and candidate counters. Measured on a four-core box that is one render in
 * 87ms and about half a second on the droplet — and because Next is one Node process on
 * one vCPU there, eight simultaneous home requests do not share any of it: they queue,
 * and every one of them waits 619ms. That queue is what an ad burst looks like, and it
 * is the TTFB the field reports (p50 780ms).
 *
 * Nothing on that list depends on who is asking. So it is read once and kept, and the
 * next visitor inside the window gets the same arrays without touching the database.
 *
 * WHAT CAN BE STALE, AND FOR HOW LONG. Everything served from here can be up to
 * `BOARD_TTL_MS` (45 seconds) old:
 *
 *  - prices, the percentages on the cards, the volume and answer counters, the hero's
 *    numbers and the category/candidate tabs. This is the price of the cache and it is
 *    the intended trade: the board is a picture of a slow-moving market, not a ticker.
 *  - a question that closed, resolved or was published inside the window can be a
 *    minute late to appear or disappear on a listing. It is never wrong where it
 *    matters: the question's own page (`/market/<slug>`), the rapid deck's answer path
 *    and `POST /api/trade` all read the database directly and re-check `status` and
 *    `closesAt` inside the transaction, so a visitor who taps a card that has just
 *    closed lands on the verdict, and no answer can be recorded against a shut market.
 *  - `invalidateBoardCache()` is the escape hatch for a write that must be visible at
 *    once (an editorial resolution, say); today nothing calls it.
 *
 * WHAT IS NEVER CACHED: anything personal. No key here carries a user id, and the only
 * per-visitor work — the taste profile and the set of questions this account has
 * already answered — is done in `rankFromPool`, outside the cache, on top of the shared
 * pool. One visitor's recommendations can never be handed to another.
 *
 * WHY A PLAIN MAP RATHER THAN `unstable_cache`. Four reasons, in order of weight:
 *  1. the values are live objects. A `MarketView` carries `Date`s and nested arrays;
 *     the framework cache serialises, and a `closesAt` that comes back as a string is a
 *     crash, not a slow path.
 *  2. the win we are actually after is *coalescing*. The entry holds the promise, not
 *     the resolved value, so eight simultaneous misses do one read between them —
 *     which is precisely the burst that measured 619ms each.
 *  3. the deployment is one standalone Node process on one droplet (see `Dockerfile`),
 *     so process memory is exactly the right scope; there is no second reader to share
 *     with and nothing to persist across a restart.
 *  4. no framework coupling: the same function works from a page, a route handler, a
 *     script or a test, and `clearBoardCache()` makes it testable.
 */
import {
  getCategoryCounts,
  getMarketStats,
  getPeopleCounts,
  listMarkets,
  type MarketSort,
  type MarketView,
} from "./markets";
import {
  loadRecommendationPool,
  rankFromPool,
  type RecommendationOptions,
  type RecommendationResult,
} from "./recommendations";

/** How long an entry may be served after it was read. */
const BOARD_TTL_MS = 45_000;

/**
 * How many entries the cache may hold at once.
 *
 * The key space is not bounded on its own: `?q=` is part of it, and a crawler can type
 * anything into it. The cap is what keeps that from being a memory leak — expired
 * entries go first and then the least recently loaded, so a flood of one-off searches
 * costs at most what the site costs today (one uncached render each) and can never
 * cost more than this many live boards' worth of rows.
 */
const MAX_ENTRIES = 128;

/** Parse-and-clamp, as everywhere else in the repo: `BOARD_CACHE="off"` turns it off. */
function ttlMs(): number {
  if (process.env.BOARD_CACHE === "off") return 0;
  const raw = process.env.BOARD_CACHE_TTL_SECONDS;
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(300, Math.max(0, n)) * 1000 : BOARD_TTL_MS;
}

interface Entry {
  at: number;
  value: Promise<unknown>;
}

const store = new Map<string, Entry>();

function evict(now: number, life: number): void {
  if (store.size <= MAX_ENTRIES) return;
  for (const [k, e] of store) if (now - e.at >= life) store.delete(k);
  // a Map iterates in insertion order and `memo` deletes before it sets, so the first
  // key left is the one that has gone longest without a read
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const life = ttlMs();
  if (life <= 0) return load();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < life) return hit.value as Promise<T>;
  const value = load();
  // a failed read must not be remembered for the next 45 seconds: drop it and let the
  // next request try the database again
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  store.delete(key);
  store.set(key, { at: now, value });
  evict(now, life);
  return value;
}

/** Drops everything. For tests, and for a write that has to be on the board at once. */
export function invalidateBoardCache(): void {
  store.clear();
}

/** How many entries are held right now — for `scripts/test-board-cache.ts`. */
export function boardCacheSize(): number {
  return store.size;
}

/* ------------------------------- the queries ------------------------------- */

export interface BoardQuery {
  sort: MarketSort;
  status: "open" | "resolved";
  q?: string;
  person?: string;
  /** a category id, or "all" for the home page */
  category: string;
}

/** A filtered board carries no strips: only the plain listing is worth building. */
export function isFilteredBoard(query: Pick<BoardQuery, "q" | "person" | "status">): boolean {
  return Boolean(query.q || query.person || query.status === "resolved");
}

type ListOpts = Parameters<typeof listMarkets>[0];

function listKey(opts: ListOpts): string {
  return [
    "list",
    opts?.category ?? "all",
    opts?.status ?? "all",
    opts?.sort ?? "trending",
    opts?.person ?? "",
    opts?.closingWithinHours ?? 0,
    opts?.limit ?? 0,
    opts?.q ?? "",
  ].join("|");
}

/** A listing, from the card projection — no `description`, no `resolutionCriteria`. */
function cachedList(opts: ListOpts): Promise<MarketView[]> {
  return memo(listKey(opts), () => listMarkets({ ...opts, columns: "card" }));
}

export interface HomeBoard {
  markets: MarketView[];
  stats: Awaited<ReturnType<typeof getMarketStats>>;
  counts: Record<string, number>;
  peopleCounts: Record<string, number>;
  closingSoon: MarketView[];
  recentlyResolved: MarketView[];
}

/**
 * Everything the home page draws that is the same for everybody, in one call.
 *
 * The pieces are cached one by one rather than as a single bundle, so the counters the
 * category pages need are read once for both and a search only ever misses on its own
 * listing.
 */
export async function getHomeBoard(query: BoardQuery): Promise<HomeBoard> {
  const filtered = isFilteredBoard(query);
  const [markets, stats, counts, peopleCounts, recentlyResolved, closingSoon] = await Promise.all([
    cachedList({ category: "all", q: query.q, sort: query.sort, status: query.status, person: query.person, limit: 600 }),
    memo("stats", () => getMarketStats()),
    memo(`counts|${query.status}|${query.person ?? ""}`, () => getCategoryCounts(query.status, query.person)),
    memo("people-counts|open", () => getPeopleCounts("open")),
    query.status === "open" && !filtered
      ? cachedList({ status: "resolved", sort: "newest", limit: 18 })
      : Promise.resolve<MarketView[]>([]),
    !filtered
      ? cachedList({ status: "open", sort: "closing", closingWithinHours: 72, limit: 4 })
      : Promise.resolve<MarketView[]>([]),
  ]);
  return { markets, stats, counts, peopleCounts, closingSoon, recentlyResolved };
}

/** The category page's half of the same board. */
export async function getCategoryBoard(
  query: BoardQuery,
): Promise<{ markets: MarketView[]; counts: Record<string, number> }> {
  const [markets, counts] = await Promise.all([
    cachedList({ category: query.category, q: query.q, sort: query.sort, status: query.status, limit: 600 }),
    memo(`counts|${query.status}|`, () => getCategoryCounts(query.status)),
  ]);
  return { markets, counts };
}

/**
 * The recommendation row, personal where there is a person to be personal about.
 *
 * The candidate pool and the board's recent activity are shared and cached; the taste
 * profile and the answered set are read per request inside `rankFromPool`. A signed-out
 * visitor has neither, so their whole result is identical to every other guest's and is
 * cached as one — which is what makes the row free on the page an ad lands on.
 */
export function getBoardRecommendations(
  opts: Pick<RecommendationOptions, "userId" | "limit" | "category" | "exclude">,
): Promise<RecommendationResult> {
  const category = opts.category ?? "all";
  const pool = memo(`rec-pool|${category}`, () => loadRecommendationPool({ category }));
  if (!opts.userId) {
    const key = `rec-guest|${category}|${opts.limit ?? 6}|${(opts.exclude ?? []).join(",")}`;
    return memo(key, async () => rankFromPool(await pool, opts));
  }
  return pool.then((p) => rankFromPool(p, opts));
}
