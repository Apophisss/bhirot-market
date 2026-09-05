/**
 * Questions this browser passed on in "מצב זריז".
 *
 * A skip used to be a scroll and nothing more: `onSkip` moved the deck one card
 * on, and the question it left behind was still the first thing the next visit
 * offered — the deck asked again, in the same order, about the very question the
 * user had already said "not this one" about. An answered question at least left
 * a `position` row behind and dropped out of the feed; a skipped one left nothing
 * at all.
 *
 * So a skip is written down too. For a signed-in user the record that counts is
 * the `rapid_skip` table (see `rapid-feed.ts`), because only the server can pick
 * the next sixty cards out of the three hundred open questions. This module is
 * the browser's own copy, and it earns its place twice over:
 *
 *   1. a signed-out visitor has no account to write to, and this is the only
 *      memory they have;
 *   2. even signed in, the deck is rendered from a snapshot taken before the
 *      skips of the last few seconds reached the server — a reload inside that
 *      window would hand the cards straight back.
 *
 * Nothing here is authoritative and nothing here is money: it is a list of ids
 * the deck subtracts from what it was served, and "כולל שאלות שכבר ראיתי" puts
 * all of them back.
 *
 * A leaf module with no imports, like `rapid-guest.ts` and `lmsr.ts` — the deck
 * and the tests use it without pulling anything else in.
 */

const KEY = "bhirot:rapid:skipped";

/**
 * How many skips the browser keeps.
 *
 * Comfortably more than the board has open questions (a few hundred), so a
 * visitor who skips their way through the whole deck still gets every one of
 * them subtracted, and bounded so the entry cannot grow without end.
 */
export const SKIP_STORE_LIMIT = 600;

/**
 * How long a skip is honoured.
 *
 * A question that closes within 120 days cannot outlive this, so in practice the
 * expiry never brings a live question back — it is what stops a browser that was
 * used once a year from carrying a list of ids that no longer exist.
 */
export const SKIP_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface RapidSkip {
  /** the market id (its slug) */
  id: string;
  /** when it was skipped, epoch ms */
  ts: number;
}

function isSkip(v: unknown): v is RapidSkip {
  const s = v as RapidSkip | null;
  return Boolean(s && typeof s.id === "string" && s.id && typeof s.ts === "number" && Number.isFinite(s.ts));
}

/* ------------------------------------------------------------ pure parts --
 * Kept free of `window` so scripts/test-rapid-skips.ts can hold them to the one
 * promise that matters: a skipped question does not come back.
 */

/** Drops what expired and keeps the newest `SKIP_STORE_LIMIT`, oldest first. */
export function pruneSkips(list: RapidSkip[], now: number): RapidSkip[] {
  const live = list.filter((s) => isSkip(s) && now - s.ts < SKIP_TTL_MS);
  const sorted = [...live].sort((a, b) => a.ts - b.ts);
  return sorted.length > SKIP_STORE_LIMIT ? sorted.slice(sorted.length - SKIP_STORE_LIMIT) : sorted;
}

/**
 * Adds `ids` to the list.
 *
 * A question that is already there keeps its original moment rather than being
 * refreshed: the point of the timestamp is when the user first waved the
 * question away, and a deck that re-skips the same card on a second pass must
 * not be able to keep an id alive forever.
 */
export function mergeSkips(list: RapidSkip[], ids: string[], now: number): RapidSkip[] {
  const pruned = pruneSkips(list, now);
  const known = new Set(pruned.map((s) => s.id));
  const added: RapidSkip[] = [];
  for (const id of ids) {
    if (!id || known.has(id)) continue;
    known.add(id);
    added.push({ id, ts: now });
  }
  if (!added.length) return pruned;
  return pruneSkips([...pruned, ...added], now);
}

/* --------------------------------------------------------------- the store --
 * Two layers, and the split is the whole point.
 *
 * The *list* is live: a skip is written the moment it happens, so a reload two
 * seconds later already knows about it. The *snapshot* — what the deck actually
 * subtracts — is taken once, when a deck mounts, and does not move afterwards.
 * A skip that removed its own card there and then would renumber the run under
 * the finger that made it ("3 / 60" jumping to "3 / 59" mid-swipe, the next
 * question sliding up before it was read). Skipping is a message to the next
 * visit, not to this one.
 *
 * The snapshot is exposed the way `rapid-guest.ts` exposes its answers — as an
 * external store, because `localStorage` does not exist on the server and reading
 * it while rendering would produce markup the client immediately contradicts.
 */

let cache: RapidSkip[] | null = null;
const EMPTY: RapidSkip[] = [];
const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

let snapshot: ReadonlySet<string> = EMPTY_IDS;
const listeners = new Set<() => void>();

/** The whole list, newest last. Cached by identity — every caller shares one array. */
export function readSkips(now = Date.now()): RapidSkip[] {
  if (cache) return cache;
  let parsed: unknown = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // private browsing, a disabled store, or a value someone else wrote — all the
    // same thing here: this browser has skipped nothing
  }
  const list = Array.isArray(parsed) ? pruneSkips(parsed.filter(isSkip), now) : EMPTY;
  cache = list.length ? list : EMPTY;
  return cache;
}

function commit(next: RapidSkip[]) {
  cache = next.length ? next : EMPTY;
  try {
    if (next.length) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: the run still works, it just will not survive a reload */
  }
}

/**
 * Records skips, and returns the ids that were not already known.
 *
 * The return value is what the deck sends to the server: re-skipping a question
 * the browser has already written down is not news to anybody. The snapshot is
 * deliberately left where it is — see above.
 */
export function addSkips(ids: string[], now = Date.now()): string[] {
  const before = readSkips(now);
  const known = new Set(before.map((s) => s.id));
  const fresh = [...new Set(ids)].filter((id) => id && !known.has(id));
  if (!fresh.length) return [];
  commit(mergeSkips(before, fresh, now));
  return fresh;
}

/** Puts every skipped question back on the table. */
export function clearSkips(): void {
  commit(EMPTY);
  snapshot = EMPTY_IDS;
  for (const l of listeners) l();
}

/**
 * Re-reads the list and hands it to the mounted deck. Called once per deck, from
 * an effect: on the server, and on the first client render, the snapshot is empty
 * and the deck shows everything it was served.
 */
export function openSkipSnapshot(now = Date.now()): void {
  const list = readSkips(now);
  if (list.length === snapshot.size && list.every((s) => snapshot.has(s.id))) return;
  snapshot = new Set(list.map((s) => s.id));
  for (const l of listeners) l();
}

/** What the deck subtracts (see `openSkipSnapshot`). */
export function skipSnapshot(): ReadonlySet<string> {
  return snapshot;
}

/** The server snapshot: nothing has been skipped as far as the server can tell. */
export function serverSkipSnapshot(): ReadonlySet<string> {
  return EMPTY_IDS;
}

export function subscribeSkipSnapshot(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Test seam: forgets everything that was read, so the next read goes back to storage. */
export function resetSkipCache(): void {
  cache = null;
  snapshot = EMPTY_IDS;
}
