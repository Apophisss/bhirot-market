/**
 * Tiny in-memory rate limiter for the public write endpoints (contact form,
 * question suggestions).
 *
 * Per server instance and lost on restart — that is enough for what it guards
 * against (one person hammering the form), and it costs no table and no round
 * trip. Anything that needs to hold across instances belongs in the database.
 */

declare global {
  var __bhirotRateLimit: Map<string, number[]> | undefined;
}

function store(): Map<string, number[]> {
  if (!globalThis.__bhirotRateLimit) globalThis.__bhirotRateLimit = new Map();
  return globalThis.__bhirotRateLimit;
}

export interface RateLimitResult {
  ok: boolean;
  /** seconds until the next attempt is allowed (0 when ok) */
  retryAfter: number;
}

/** Records one hit for `key`; false once `limit` hits happened inside `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const map = store();
  const hits = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    map.set(key, hits);
    const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  hits.push(now);
  map.set(key, hits);
  // the map is unbounded in principle; prune the stale keys occasionally
  if (map.size > 5000) {
    for (const [k, v] of map) {
      if (!v.some((t) => now - t < windowMs)) map.delete(k);
    }
  }
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client identity for anonymous submissions. */
export function clientKey(req: Request, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}
