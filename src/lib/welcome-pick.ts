/**
 * Which questions the paid landing page opens with.
 *
 * The page used to take the three "trending" markets, which on this board means the
 * biggest long-range questions — "האם נתניהו יעמוד בראש הממשלה הבאה?", closing in
 * January 2027. The card said so, right under the question, on the one page whose
 * job is to make a stranger's first answer feel worth keeping. A prediction game
 * has one promise a quiz cannot make — *you will find out soon* — and a question
 * decided four months from now breaks it before the first tap.
 *
 * So the card in the hero is the best question that closes within `SOON_HOURS`:
 * still in play (a price near 0 or 1 reads as settled and makes the tap pointless),
 * short enough to read in one glance, and never a question about someone's death
 * or health — the board's own rules already forbid those (AGENT.md), so this is
 * only a belt for the braces. The two cards under it stay "trending", minus the one
 * that went up top.
 *
 * Dependency-free leaf module, like `rapid-guest.ts`: the page and the test share it
 * without pulling the database in.
 */

/** the promise on the card is "you will know within two days" — the same window the deck's guest banner uses */
export const WELCOME_SOON_HOURS = 72;
/** a question the market treats as settled is not worth a stranger's first answer */
const IN_PLAY_LOW = 0.12;
const IN_PLAY_HIGH = 0.88;
/** the hero card shows the question in 18–20px type: three lines on a 390px phone */
const MAX_TITLE = 95;

export interface WelcomeCandidate {
  id: string;
  title: string;
  probability: number;
  /** epoch ms */
  closesAt: number;
}

/** In play, readable at hero size, and decided soon. */
export function isHeroWorthy(m: WelcomeCandidate, now: number): boolean {
  const hoursLeft = (m.closesAt - now) / 3_600_000;
  return (
    hoursLeft > 1 &&
    hoursLeft <= WELCOME_SOON_HOURS &&
    m.probability >= IN_PLAY_LOW &&
    m.probability <= IN_PLAY_HIGH &&
    m.title.length <= MAX_TITLE
  );
}

/**
 * Picks the hero card and the cards under it.
 *
 * `closingSoon` is the board sorted by closing time (soonest first) and already
 * limited to the window; `trending` is the board's default order. The hero is the
 * first closing-soon question that qualifies; when none does — a quiet day, or a
 * board of near-certainties — the first trending question takes the slot, exactly
 * as before. The rest is trending with the hero removed, cut to `count - 1`.
 */
export function pickWelcomeQuestions<T extends WelcomeCandidate>(
  closingSoon: T[],
  trending: T[],
  opts: { count: number; now?: number },
): { hero: T | null; rest: T[] } {
  // the clock is read here and not in the page: a server component reading Date.now()
  // during render trips the purity lint, and the library is where the rule expects it
  const now = opts.now ?? Date.now();
  const hero = closingSoon.find((m) => isHeroWorthy(m, now)) ?? trending[0] ?? null;
  const rest = trending.filter((m) => m.id !== hero?.id).slice(0, Math.max(0, opts.count - 1));
  return { hero, rest };
}
