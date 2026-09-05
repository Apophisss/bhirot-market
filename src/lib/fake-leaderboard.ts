/**
 * The anonymous leaderboard: a pseudonym for every real trader, plus a
 * fabricated crowd of a few hundred so the board reads like a live market.
 *
 * Two separate promises, both kept here:
 *
 * 1. **Anonymous.** The board never carries an identity. A real trader gets a
 *    handle derived from a hash of their user id — stable across visits, shared
 *    by nobody, and not reversible into a name. The page component receives no
 *    name, no avatar URL and no user id at all, so there is nothing to leak in
 *    the HTML, in the RSC payload or in a screenshot; the only thing a viewer
 *    learns about their own row is that it is theirs (`isMe`), decided on the
 *    server from their session.
 *
 * 2. **Display only.** Exactly the contract of `fake-activity.ts`: nothing here
 *    writes to the database, moves a price, adds volume, touches a portfolio or
 *    changes anyone's balance. Every fabricated trader is a pure function of an
 *    index and the clock, so the site's real numbers cannot be contaminated by
 *    it even in principle — and a real trader's rank is computed against those
 *    numbers, never stored.
 *
 * The fabricated crowd drifts on an absolute time axis (one step per
 * `FAKE_LEADER_EPOCH_MS`), so the board is identical on every device inside the
 * same step, and moves a little — never resets — between steps.
 */

import { hash32, hashString, unit } from "./hash";
import { STARTING_BALANCE } from "./db/schema";

/** how many fabricated traders sit on the board */
export const FAKE_TRADER_COUNT = 320;

/** the crowd re-shuffles gently once per step */
export const FAKE_LEADER_EPOCH_MS = 10 * 60_000;

/** a handle is one of these nouns and one of these adjectives — 1,280 combinations */
const NOUNS = [
  "ינשוף", "נמר", "שועל", "ברדלס", "דוב", "זאב", "עורב", "נשר",
  "דולפין", "קרנף", "תן", "צבוע", "יעל", "ראם", "פיל", "גמל",
  "סוס", "איל", "קיפוד", "דורבן", "תנין", "כריש", "טווס", "בז",
  "עיט", "שחף", "חתול", "כלב", "שור", "תיש", "אריה", "קוף",
  "דוכיפת", "שרקרק", "נחליאלי", "זרזיר", "סנאי", "חמוס", "ג׳ירף", "פינגווין",
] as const;

const ADJECTIVES = [
  "זהיר", "נועז", "שקט", "ממושמע", "סבלני", "מהיר", "ערמומי", "רגוע",
  "חד", "חכם", "עקשן", "סקרן", "זריז", "מחושב", "אמיץ", "ותיק",
  "צנוע", "נחוש", "גמיש", "יציב", "חמקמק", "מסתורי", "שיטתי", "קפדני",
  "אופטימי", "ספקן", "נמרץ", "מנוסה", "ביישן", "תזזיתי", "קליל", "אדיב",
] as const;

/** number of distinct handles before a numeric suffix is needed */
export const HANDLE_SLOTS = NOUNS.length * ADJECTIVES.length;

export function handleForSlot(slot: number): string {
  const s = ((slot % HANDLE_SLOTS) + HANDLE_SLOTS) % HANDLE_SLOTS;
  return `${NOUNS[s % NOUNS.length]} ${ADJECTIVES[Math.floor(s / NOUNS.length) % ADJECTIVES.length]}`;
}

/** what the leaderboard needs to know about a real trader — deliberately no name, no image */
export interface RealTrader {
  userId: string;
  netWorth: number;
  pnl: number;
  tradeCount: number;
}

/** one row as the page renders it: a handle, numbers, and nothing identifying */
export interface BoardRow {
  rank: number;
  handle: string;
  netWorth: number;
  pnl: number;
  tradeCount: number;
  /** true only for the row belonging to the visitor asking for the page */
  isMe: boolean;
  /** fabricated crowd vs. a real account — kept for tests and for future copy */
  fabricated: boolean;
}

export function epochAt(ms: number): number {
  return Math.floor(ms / FAKE_LEADER_EPOCH_MS);
}

/** average bell-shaped-ish draw in [-1, 1] from three independent hashes */
function bell(i: number, k: number): number {
  return (unit(hash32(i, k)) + unit(hash32(i, k + 1)) + unit(hash32(i, k + 2)) - 1.5) / 1.5;
}

interface Seat {
  slot: number;
  netWorth: number;
  pnl: number;
  tradeCount: number;
  fabricated: boolean;
  isMe: boolean;
}

/**
 * The fabricated crowd for one time step.
 *
 * A trader's shape is fixed by their index (how much they trade, how good they
 * are); only a small wobble depends on the step, so the board keeps its
 * characters and still moves between visits. Most of the crowd sits within a
 * couple of thousand shekels of the ₪10,000 everyone starts with, and the tail
 * of heavy traders is what fills the top and the bottom of the table.
 */
export function fabricatedTraders(epoch: number, count = FAKE_TRADER_COUNT): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < count; i++) {
    // heavy-tailed activity: most play a little, a few play a lot
    const tradeCount = 1 + Math.round(unit(hash32(i, 0x11)) ** 2.4 * 380);
    // skill × exposure: the more you trade, the further from ₪10,000 you land
    const edge = 0.05; // the crowd is very slightly ahead — losers stop playing
    const pnlBase = (bell(i, 0x21) + edge) * 420 * Math.sqrt(tradeCount);
    // the wobble is the only part that depends on the clock
    const wobble = (unit(hash32(hash32(i, 0x31), epoch)) - 0.5) * 0.012 * (STARTING_BALANCE + Math.abs(pnlBase));
    const netWorth = Math.max(120, STARTING_BALANCE + pnlBase + wobble);
    out.push({
      slot: hash32(i, 0x41) % HANDLE_SLOTS,
      netWorth,
      pnl: netWorth - STARTING_BALANCE,
      tradeCount: tradeCount + (hash32(hash32(i, 0x51), epoch) % 3),
      fabricated: true,
      isMe: false,
    });
  }
  return out;
}

/**
 * The whole board, ranked: the real traders mixed into the fabricated crowd and
 * sorted by net worth, each row wearing a handle that no other row wears.
 *
 * Handles are assigned after sorting, by probing forward from the slot the
 * trader hashes to, so a real trader keeps the same handle for as long as the
 * rows around them do not collide with it — and two rows never show the same
 * one.
 */
export function buildBoard(
  real: RealTrader[],
  opts: { now?: number; meId?: string | null; fakeCount?: number } = {},
): BoardRow[] {
  const epoch = epochAt(opts.now ?? Date.now());
  const seats: Seat[] = [
    ...fabricatedTraders(epoch, opts.fakeCount ?? FAKE_TRADER_COUNT),
    ...real.map((r) => ({
      slot: hashString(r.userId) % HANDLE_SLOTS,
      netWorth: r.netWorth,
      pnl: r.pnl,
      tradeCount: r.tradeCount,
      fabricated: false,
      isMe: !!opts.meId && r.userId === opts.meId,
    })),
  ];

  seats.sort((a, b) => b.netWorth - a.netWorth || b.tradeCount - a.tradeCount || a.slot - b.slot);

  const taken = new Set<number>();
  return seats.map((s, i) => {
    let slot = s.slot;
    for (let probe = 0; probe < HANDLE_SLOTS && taken.has(slot); probe++) slot = (slot + 1) % HANDLE_SLOTS;
    const handle = taken.has(slot) ? `${handleForSlot(s.slot)} ${i + 1}` : handleForSlot(slot);
    taken.add(slot);
    return {
      rank: i + 1,
      handle,
      netWorth: s.netWorth,
      pnl: s.pnl,
      tradeCount: s.tradeCount,
      isMe: s.isMe,
      fabricated: s.fabricated,
    };
  });
}
