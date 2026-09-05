/**
 * Answers a visitor gave before signing in.
 *
 * Rapid mode used to end at the first tap: "כן" on the very first card navigated
 * straight to `/login?callbackUrl=/rapid`, the counter stayed on "נענו 0", and the
 * answer itself was thrown away — so a visitor who did sign in came back to `1/60`
 * with nothing to show for the decision they had already made. The one thing a
 * prediction market has to demonstrate is that answering is easy, and the product
 * refused to let anyone try it once.
 *
 * So the first few answers are kept here instead, in the browser, and turned into
 * real positions on the way back from Google (see `RapidGuestSync`). Nothing here
 * is authoritative: the price is re-quoted by the server at redemption time, and a
 * question that closed in between is simply dropped. What is stored is a decision,
 * not a trade.
 *
 * A leaf module with no imports, like `lmsr.ts` and `rapid.ts` — the deck, the
 * redeemer and the tests all use it without pulling anything else in.
 */

const KEY = "bhirot:rapid:guest";

/**
 * How many questions may be answered without an account.
 *
 * Enough that the mechanic is understood and there is something worth claiming
 * (four answers read as "I have a stake in this"), few enough that the board is
 * not being given away — the point of the limit is that the fifth answer is worth
 * an account.
 */
export const GUEST_LIMIT = 4;

export interface GuestAnswer {
  marketSlug: string;
  side: "YES" | "NO";
  /** the price on the card when it was answered — for the copy, never for the trade */
  priceAtAnswer: number;
  /** what the card was asking, so the sign-in gate can show the answers back */
  title: string;
  ts: number;
}

function isAnswer(v: unknown): v is GuestAnswer {
  const a = v as GuestAnswer | null;
  return Boolean(
    a &&
      typeof a.marketSlug === "string" &&
      (a.side === "YES" || a.side === "NO") &&
      typeof a.priceAtAnswer === "number" &&
      typeof a.ts === "number",
  );
}

/* --------------------------------------------------------------- the store --
 * Exposed as a subscribable store rather than read during render: `localStorage`
 * does not exist on the server, and reading it while rendering would produce
 * markup the client immediately contradicts.
 */

let cache: GuestAnswer[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: GuestAnswer[] = [];

/**
 * Every read goes through the same cached array instance while nothing has
 * changed. `useSyncExternalStore` compares snapshots by identity and would loop
 * forever on a fresh array each time.
 */
export function readGuestAnswers(): GuestAnswer[] {
  if (cache) return cache;
  let parsed: unknown = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // private browsing, a disabled store, or a value someone else wrote — all the
    // same thing here: this visitor has no saved answers
  }
  cache = Array.isArray(parsed) ? parsed.filter(isAnswer).slice(0, GUEST_LIMIT) : EMPTY;
  return cache;
}

function commit(next: GuestAnswer[]) {
  cache = next;
  try {
    if (next.length) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: the run still works, it just will not survive a reload */
  }
  for (const l of listeners) l();
}

/** Records one answer. Answering the same question twice keeps the first answer. */
export function addGuestAnswer(answer: GuestAnswer): void {
  const current = readGuestAnswers();
  if (current.length >= GUEST_LIMIT || current.some((a) => a.marketSlug === answer.marketSlug)) return;
  commit([...current, answer]);
}

/** Drops everything — called the moment the answers are claimed for an account. */
export function clearGuestAnswers(): void {
  commit(EMPTY);
}

export function subscribeGuestAnswers(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The server snapshot: a visitor being rendered on the server has answered nothing. */
export function serverGuestAnswers(): GuestAnswer[] {
  return EMPTY;
}
