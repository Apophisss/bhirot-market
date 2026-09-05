/**
 * Deterministic hashing for the display-only fabrications (`fake-activity.ts`,
 * `fake-leaderboard.ts`). Nothing here is cryptographic — the only requirement
 * is that the same input yields the same number on every device and every
 * render, so that what one visitor sees is what the next one sees.
 */

/** 32-bit avalanche of (seed, i) → unsigned int */
export function hash32(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** hash → [0, 1) */
export function unit(h: number): number {
  return h / 0x1_0000_0000;
}

/** a string (a user id, say) → unsigned 32-bit int */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return hash32(h, s.length);
}
