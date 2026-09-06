import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { EVENTS, type EventName } from "./events";

const { analyticsEvents } = schema;

/** Events older than this are dropped by the hourly cron, so the log stays small. */
export const RETENTION_DAYS = Number(process.env.ANALYTICS_RETENTION_DAYS ?? 180);

/** Analytics is on unless explicitly disabled (e.g. for a local benchmark run). */
export const analyticsEnabled = process.env.ANALYTICS_DISABLED !== "true";

/*
  Crawlers and link-preview fetchers, and nothing that a person browses with. Four
  of the old tokens matched real visitors: `telegram` (the Telegram-Android in-app
  browser), `duckduck` (the DuckDuckGo Android browser), `yandex` (the Yandex app)
  and a bare `bot` (CUBOT phones). A Demand Gen campaign serves inside exactly
  these apps, and every one of those visitors was dropped with a 204 and never
  reached the log. The crawler forms of the same names are kept.
*/
const BOT_RE =
  /(?<!cu)bot(?:\b|\/|-)|crawl|spider|slurp|bingpreview|yandex(?:bot|images|metrika|accessibility)|duckduckbot|baidu|facebookexternalhit|embedly|quora link preview|whatsapp\/|telegrambot|discordbot|preview|lighthouse|headless|pingdom|uptime|monitor|curl\/|wget|python-requests|axios\/|node-fetch|go-http-client/i;

export interface EventInput {
  name: EventName | string;
  path?: string | null;
  query?: string | null;
  referrer?: string | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  marketId?: string | null;
  value?: number | null;
  props?: Record<string, unknown> | null;
  ts?: Date;
}

export interface RequestContext {
  visitorId: string;
  device: string;
  country: string;
  isBot: boolean;
}

function clean(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function clientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "0.0.0.0";
}

function deviceOf(ua: string): string {
  if (!ua) return "unknown";
  if (/ipad|tablet|playbook|silk/i.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod|phone/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * A cookie-less visitor id: sha256(salt + ip + user-agent + day), truncated.
 * It rotates every day, so it can count "visitors today" without ever storing an IP,
 * and it cannot be used to follow someone across days.
 */
export function visitorHash(ip: string, ua: string, day = new Date().toISOString().slice(0, 10)): string {
  const salt = process.env.ANALYTICS_SALT || process.env.AUTH_SECRET || "bhirot-market";
  return createHash("sha256").update(`${salt}|${ip}|${ua}|${day}`).digest("hex").slice(0, 16);
}

/** Everything we derive from the request itself (never stored raw). */
export function requestContext(req: Request): RequestContext {
  const ua = req.headers.get("user-agent") ?? "";
  return {
    visitorId: visitorHash(clientIp(req), ua),
    device: deviceOf(ua),
    country: (req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? "").slice(0, 2).toUpperCase(),
    isBot: BOT_RE.test(ua) || !ua,
  };
}

/** "https://www.google.com/search?q=x" -> "google.com"; own domain -> "internal". */
export function referrerHost(referrer: string | null | undefined, siteHost?: string | null): string {
  if (!referrer) return "";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (siteHost && host === siteHost.replace(/^www\./, "")) return "internal";
    return host.slice(0, 80);
  } catch {
    return "";
  }
}

/** `/market/will-x-happen` -> `will-x-happen` */
export function marketSlugFromPath(path: string): string | null {
  const m = /^\/market\/([a-z0-9-]{1,120})/i.exec(path);
  return m ? m[1] : null;
}

const MAX_BATCH = 30;

/** Writes a batch of events. Never throws — analytics must not break a request. */
export async function recordEvents(events: EventInput[], ctx: RequestContext): Promise<number> {
  if (!analyticsEnabled || ctx.isBot || !events.length) return 0;
  const rows = events.slice(0, MAX_BATCH).map((e) => {
    const path = clean(e.path, 300) || "/";
    const props = e.props && typeof e.props === "object" ? JSON.stringify(e.props).slice(0, 2000) : "{}";
    const referrer = clean(e.referrer, 80);
    return {
      name: clean(e.name, 40) || "unknown",
      path,
      query: clean(e.query, 300),
      referrer,
      source: clean(e.source, 80) || (referrer && referrer !== "internal" ? referrer : ""),
      medium: clean(e.medium, 40),
      campaign: clean(e.campaign, 80),
      visitorId: ctx.visitorId,
      sessionId: clean(e.sessionId, 40),
      userId: e.userId ? clean(e.userId, 64) : null,
      marketId: e.marketId ? clean(e.marketId, 120) : marketSlugFromPath(path),
      device: ctx.device,
      country: ctx.country,
      value: typeof e.value === "number" && Number.isFinite(e.value) ? e.value : null,
      props,
      ts: e.ts ?? new Date(),
    };
  });
  try {
    const db = await getDb();
    await db.insert(analyticsEvents).values(rows);
    return rows.length;
  } catch (err) {
    console.error("[analytics] insert failed", err);
    return 0;
  }
}

/**
 * Server-side tracking for the events we never want to lose to an ad-blocker
 * (trades, comments, sign-ups). Fire-and-forget: callers don't await it.
 */
export async function track(
  name: EventName | string,
  opts: Omit<EventInput, "name"> & { req?: Request | null } = {},
): Promise<void> {
  const { req, ...event } = opts;
  const ctx = req
    ? { ...requestContext(req), isBot: false }
    : { visitorId: "", device: "server", country: "", isBot: false };
  await recordEvents([{ ...event, name }], ctx);
}

/** Drops events older than `days`, called from the hourly cron. */
export async function pruneAnalytics(days = RETENTION_DAYS): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const res = await db.delete(analyticsEvents).where(lt(analyticsEvents.ts, cutoff)).returning({ id: analyticsEvents.id });
  return res.length;
}

/** Total rows in the log — shown on the admin dashboard so the size stays visible. */
export async function analyticsSize(): Promise<{ events: number; oldest: Date | null }> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)`, oldest: sql<number | null>`min(${analyticsEvents.ts})` })
    .from(analyticsEvents);
  return { events: row?.n ?? 0, oldest: row?.oldest ? new Date(row.oldest) : null };
}

/**
 * Is the tracking pipeline alive? Counts only — the same class of aggregate
 * /api/health already publishes, and enough to notice from outside that events
 * stopped landing (a broken collector, a blocked beacon, an empty table).
 */
export async function analyticsHealth(): Promise<{ events: number; last24h: number; lastEventAt: string | null }> {
  const db = await getDb();
  const since = new Date(Date.now() - 86_400_000);
  const [row] = await db
    .select({
      n: sql<number>`count(*)`,
      recent: sql<number>`sum(case when ${analyticsEvents.ts} >= ${since.getTime()} then 1 else 0 end)`,
      last: sql<number | null>`max(${analyticsEvents.ts})`,
    })
    .from(analyticsEvents);
  return {
    events: row?.n ?? 0,
    last24h: row?.recent ?? 0,
    lastEventAt: row?.last ? new Date(row.last).toISOString() : null,
  };
}

export { EVENTS };
