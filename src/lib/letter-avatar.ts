/**
 * The letter that goes in the little avatar circle next to a trade.
 *
 * DISPLAY ONLY, like the rest of the activity feed: the letter is derived from
 * the item's own key, never from a trader. The feed carries no identity (see
 * `fake-activity.ts`), so a real trade's circle says nothing about who made it —
 * it is a decoration that makes a row look like a person instead of a bullet.
 *
 * A uniform draw over A–Z gives that away immediately: twenty circles in a
 * column come out holding Q, X and Z, which no crowd of real people produces.
 * The weights below follow how often a given name starts with each letter, in
 * the Latin transliteration an Israeli audience reads (Avi, Yossi, Maya, Noa,
 * Tal, Shira…), so the column reads like a room full of traders.
 */

/** relative frequency of each first letter; only the ratios matter */
const LETTER_WEIGHTS: Readonly<Record<string, number>> = {
  A: 11, // Avi, Amit, Adi, Aviv, Alon
  B: 3, // Ben, Bar, Barak
  C: 1.5, // Chen
  D: 6, // David, Dana, Dor, Daniel
  E: 5, // Eitan, Elad, Efrat
  F: 0.5,
  G: 5, // Guy, Gal, Gili
  H: 3, // Hila, Hadar
  I: 4, // Itay, Idan, Inbal
  J: 0.5,
  K: 2, // Karin, Keren
  L: 4, // Lior, Liat, Lihi
  M: 8, // Michal, Maya, Moshe, Matan
  N: 6, // Noa, Nir, Noam, Netta
  O: 5, // Ofir, Omer, Or, Orit
  P: 1, // Pnina
  Q: 0.1,
  R: 5, // Roni, Ronen, Rotem
  S: 6, // Shira, Sagi, Shani
  T: 5, // Tal, Tamar, Tomer
  U: 0.2, // Uri
  V: 0.3,
  W: 0.2,
  X: 0.1,
  Y: 8, // Yossi, Yael, Yuval, Yarden
  Z: 1.5, // Ziv, Zohar
};

const LETTERS = Object.keys(LETTER_WEIGHTS);
/** running sums, so a pick is one scan over 26 numbers */
const CUMULATIVE = LETTERS.reduce<number[]>((acc, l) => {
  acc.push((acc[acc.length - 1] ?? 0) + LETTER_WEIGHTS[l]);
  return acc;
}, []);
const TOTAL_WEIGHT = CUMULATIVE[CUMULATIVE.length - 1];

/**
 * The letter for a 32-bit hash, drawn from the weighted distribution above.
 * Pure and total: every input yields one of A–Z.
 */
export function letterForHash(hash: number): string {
  const x = ((hash >>> 0) / 0x1_0000_0000) * TOTAL_WEIGHT;
  for (let i = 0; i < CUMULATIVE.length; i++) {
    if (x < CUMULATIVE[i]) return LETTERS[i];
  }
  return LETTERS[LETTERS.length - 1];
}

/**
 * FNV-1a over the seed, finished with a murmur3 avalanche — the same number on
 * the server and in the browser.
 *
 * The avalanche is not decoration: raw FNV-1a barely moves its *high* bits when
 * only the last character changes, and the seeds here are things like "t:1041"
 * and "t:1042". Without it, consecutive ids land on the same letter and on
 * neighbouring hues, which is exactly the pattern that gives a feed away.
 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The letter for a stable string seed (a trade key, a user id). */
export function letterFor(seed: string): string {
  return letterForHash(hashSeed(seed));
}

/** exported for the distribution test */
export const LETTER_TABLE = { LETTER_WEIGHTS, TOTAL_WEIGHT } as const;
