/**
 * Answers a visitor gave before signing in.
 *
 * Rapid mode used to end at the first tap: "כן" on the very first card navigated
 * straight to `/login?callbackUrl=/rapid`, the counter stayed on "נענו 0", and the
 * answer itself was thrown away — so a visitor who did sign in came back to `1/60`
 * with nothing to show for the decision they had already made. The one thing a
 * guessing game has to demonstrate is that answering is easy, and the product
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
 * It was four, which is barely a run: the wall went up while the visitor was still
 * working out what the prices meant, so the account was being asked for in exchange
 * for a demo. Ten is a round of the deck — long enough to have formed opinions on
 * the board and to be holding a set of answers worth keeping, so the account is
 * asked for at the point where it is about keeping a run rather than starting one.
 *
 * The limit is what makes that ask honest, not what makes the board scarce: the
 * screens that raise it (the deck banner, the gate, the sign-in recap) all say the
 * same three things — the account is free, it is one click, and here is what it
 * opens.
 */
export const GUEST_LIMIT = 10;

/**
 * How many answers a recap lists by name before summing up the rest.
 *
 * The gate and the sign-in screen exist to be acted on, and a ten-item list pushes
 * the button that acts on them off the bottom of a phone. The newest answers are
 * listed — they are the ones the visitor remembers giving — and the rest are
 * counted.
 */
export const GUEST_RECAP_LIMIT = 4;

/**
 * How many answers the browser will actually hold: the free run, plus the one
 * that hit the wall.
 *
 * The tap that raises the wall is a decision the visitor made — they answered the
 * question and only then were asked to sign in. Throwing it away meant the sign-in
 * screen asked for an account in order to keep the free run while quietly
 * discarding the answer that ended it, and coming back from Google landed on a
 * deck that had never heard of it.
 * It is kept and redeemed with the rest; the *limit* is about when the wall goes
 * up, not about what is remembered.
 */
export const GUEST_STORE_LIMIT = GUEST_LIMIT + 1;

export interface GuestAnswer {
  marketSlug: string;
  side: "YES" | "NO";
  /** the price on the card when it was answered — for the copy, never for the trade */
  priceAtAnswer: number;
  /** what the card was asking, so the sign-in gate can show the answers back */
  title: string;
  /**
   * How many points the visitor had on the slider when he answered.
   *
   * Redemption used to spend the deck's default (₪20) on every answer, whatever the
   * card had said while it was being answered: a visitor who moved the slider to ₪50,
   * answered four questions and signed in got four ₪20 positions — the site quoting
   * one number back and binding another. Optional because answers written by an
   * earlier version of the deck are still in browsers; those redeem at the default,
   * which is what they were shown.
   */
  stake?: number;
  /**
   * When the question closes, epoch ms — so the screens that ask for the account can
   * say the one thing a stranger actually wants to know: *when will I find out*.
   * Optional because answers written by an earlier deck are still in browsers.
   */
  closesAt?: number;
  ts: number;
}

function isAnswer(v: unknown): v is GuestAnswer {
  const a = v as GuestAnswer | null;
  return Boolean(
    a &&
      typeof a.marketSlug === "string" &&
      (a.side === "YES" || a.side === "NO") &&
      typeof a.priceAtAnswer === "number" &&
      (a.stake === undefined || typeof a.stake === "number") &&
      (a.closesAt === undefined || typeof a.closesAt === "number") &&
      typeof a.ts === "number",
  );
}

/* ------------------------------------------------------- what the run is worth --
 * The free run used to be described to the visitor only as a count running out
 * ("נשארו לכם 8 תשובות"). A count is a limit; what makes an account worth one tap
 * is what the answers already given would pay and how soon the visitor would know.
 * Both are derived here from what the browser holds, so every screen that raises the
 * ask (the deck banner, the wall, the sign-in recap) quotes the same two numbers.
 */

/** The stake an old answer, written before stakes were stored, is redeemed at. */
export const GUEST_LEGACY_STAKE = 20;

/**
 * Roughly what the saved answers pay if every one of them is right, in points.
 *
 * An estimate on purpose: a binary share bought at price p pays 1 per share, so
 * `stake / p` shares — the same arithmetic the deck's own payout line uses before
 * the market maker moves. The real position is quoted again by the server at
 * redemption, which is why every screen prints it with "≈".
 */
/**
 * How much one answer may contribute to the headline, as a multiple of its stake.
 * A tap on a 2% side is worth fifty times the stake on paper; one such tap would
 * dominate the estimate and turn an honest "≈" into a lottery figure.
 */
export const GUEST_PAYOUT_CAP = 8;

export function guestPayoutEstimate(answers: GuestAnswer[]): number {
  let total = 0;
  for (const a of answers) {
    const stake = a.stake ?? GUEST_LEGACY_STAKE;
    const p = Math.min(0.99, Math.max(0.01, a.priceAtAnswer));
    total += Math.min(stake / p, stake * GUEST_PAYOUT_CAP);
  }
  return Math.round(total);
}

/* ---------------------------------------------------------------- the soft ask --
 * The wall at `GUEST_LIMIT` was the only ask a guest ever met, and the campaign's own
 * numbers said nobody reached it. So there is an earlier, softer one: after
 * `GUEST_SOFT_ASK` answers a sheet slides up over the deck with what the answers are
 * worth and the Google button itself — dismissible, once per browser. The wall stays
 * where it was; this is not a shorter free run, it is the ask arriving where the
 * players actually are.
 */
export const GUEST_SOFT_ASK = 3;

const SOFT_ASK_KEY = "bhirot:rapid:softask";

/** Has this browser already seen the soft ask? Storage that refuses reads as "yes" — an ask that cannot be remembered must not repeat every card. */
export function softAskSeen(): boolean {
  try {
    return window.localStorage.getItem(SOFT_ASK_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSoftAskSeen(): void {
  try {
    window.localStorage.setItem(SOFT_ASK_KEY, "1");
  } catch {
    /* private mode: it will show once more next time, at most */
  }
}

/** Test seam. */
export function resetSoftAskSeen(): void {
  try {
    window.localStorage.removeItem(SOFT_ASK_KEY);
  } catch {
    /* nothing to forget */
  }
}

/** The window in which "you will know soon" is true: a question that closes within it. */
export const GUEST_SOON_MS = 48 * 60 * 60 * 1000;

/** How many of the saved answers are decided within `GUEST_SOON_MS` of `now`. */
export function guestResolvingSoon(answers: GuestAnswer[], now = Date.now()): number {
  let n = 0;
  for (const a of answers) {
    if (typeof a.closesAt === "number" && a.closesAt > now && a.closesAt - now <= GUEST_SOON_MS) n++;
  }
  return n;
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
  cache = Array.isArray(parsed) ? parsed.filter(isAnswer).slice(0, GUEST_STORE_LIMIT) : EMPTY;
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

/**
 * Records one answer, replacing any earlier answer to the same question.
 *
 * The write used to be insert-if-absent, and the two screens that write here
 * (`/welcome` and the deck) offer overlapping questions — so answering "לא" on
 * the landing page and then "כן" on the same card in rapid mode left "NO" in the
 * store while the card said "כן · נשמר". The visitor was shown a confirmation of
 * a decision the browser had not kept, and the one that was redeemed after
 * signing in was the one they had changed their mind about.
 *
 * An answer that changes an existing one is therefore an update — of the side,
 * of the price it was taken at, and of the moment — and it never counts against
 * the limit, because it is not a new question.
 */
export function addGuestAnswer(answer: GuestAnswer): void {
  const current = readGuestAnswers();
  const at = current.findIndex((a) => a.marketSlug === answer.marketSlug);
  if (at >= 0) {
    const next = [...current];
    next[at] = answer;
    commit(next);
    return;
  }
  if (current.length >= GUEST_STORE_LIMIT) return;
  commit([...current, answer]);
}

/** The side this browser answered on a question, or null. */
export function guestAnswerFor(answers: GuestAnswer[], marketSlug: string): GuestAnswer | null {
  return answers.find((a) => a.marketSlug === marketSlug) ?? null;
}

/**
 * Is the sign-in wall up?
 *
 * The free run is `GUEST_LIMIT` questions; the answer that hits the wall is kept
 * (see `GUEST_STORE_LIMIT`), so this asks about the count, not about whether the
 * store is full.
 */
export function guestGateReached(answers: GuestAnswer[]): boolean {
  return answers.length >= GUEST_LIMIT;
}

/**
 * How many free answers are left.
 *
 * A ten-question run is long enough that "some answers are free" stops being
 * information — the deck says how many are left so the wall is never a surprise,
 * and so the visitor can see it coming while there is still something to do about
 * it. Never negative: the answer that hits the wall is kept (see
 * `GUEST_STORE_LIMIT`), and "‎-1 נותרו" is not a thing to show anyone.
 */
export function guestAnswersLeft(answers: GuestAnswer[]): number {
  return Math.max(0, GUEST_LIMIT - answers.length);
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

/** Test seam: forgets what was read, so the next read goes back to storage. */
export function resetGuestCache(): void {
  cache = null;
}

/** The server snapshot: a visitor being rendered on the server has answered nothing. */
export function serverGuestAnswers(): GuestAnswer[] {
  return EMPTY;
}
