import { sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { EVENTS } from "./events";

/**
 * Every aggregate the admin dashboard and the analysis bundle need.
 * Written as raw SQL on purpose: these are reporting queries over the analytics log,
 * and SQLite does the grouping far better than pulling rows into JS.
 */

/** Days are Israel days (the audience is Israeli), not UTC days. */
function dayShift(): string {
  try {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", timeZoneName: "shortOffset" }).format(new Date());
    const m = /GMT([+-]\d{1,2})/.exec(s);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && Math.abs(n) <= 14) return `${n >= 0 ? "+" : "-"}${Math.abs(n)} hours`;
    }
  } catch {
    /* fall through */
  }
  return "+3 hours";
}

export const TZ_SHIFT = dayShift();
export const TZ_NAME = "Asia/Jerusalem";

/** `date(col/1000,'unixepoch','+3 hours')` — the local day of a timestamp_ms column. */
function day(col: string) {
  return sql.raw(`date(${col} / 1000, 'unixepoch', '${TZ_SHIFT}')`);
}

export interface Range {
  days: number;
  from: number;
  to: number;
  /** the equally long window right before `from`, for period-over-period deltas */
  prevFrom: number;
}

export function range(days = 30, now = Date.now()): Range {
  const span = Math.max(1, Math.min(days, 730)) * 86_400_000;
  return { days, from: now - span, to: now, prevFrom: now - span * 2 };
}

async function all<T>(query: SQL): Promise<T[]> {
  const db = await getDb();
  return db.all<T>(query);
}

async function one<T>(query: SQL): Promise<T | undefined> {
  const rows = await all<T>(query);
  return rows[0];
}

/* ------------------------------- traffic -------------------------------- */

export interface TrafficSummary {
  pageviews: number;
  visitors: number;
  sessions: number;
  events: number;
  pagesPerSession: number;
  /** share of sessions with a single pageview */
  bounceRate: number;
  /** median-ish: mean seconds on page from page_exit events */
  avgSecondsOnPage: number;
}

async function trafficIn(from: number, to: number): Promise<TrafficSummary> {
  const row = await one<{
    pageviews: number;
    visitors: number;
    sessions: number;
    events: number;
    seconds: number | null;
  }>(sql`
    select
      sum(case when name = ${EVENTS.pageview} then 1 else 0 end) as pageviews,
      count(distinct visitorId) as visitors,
      count(distinct nullif(sessionId, '')) as sessions,
      count(*) as events,
      avg(case when name = ${EVENTS.pageExit} and value between 0 and 3600000 then value / 1000.0 end) as seconds
    from analytics_event
    where ts >= ${from} and ts < ${to}
  `);
  const bounce = await one<{ bounced: number; total: number }>(sql`
    select
      sum(case when views = 1 then 1 else 0 end) as bounced,
      count(*) as total
    from (
      select sessionId, count(*) as views
      from analytics_event
      where ts >= ${from} and ts < ${to} and name = ${EVENTS.pageview} and sessionId <> ''
      group by sessionId
    )
  `);
  const pageviews = row?.pageviews ?? 0;
  const sessions = row?.sessions ?? 0;
  return {
    pageviews,
    visitors: row?.visitors ?? 0,
    sessions,
    events: row?.events ?? 0,
    pagesPerSession: sessions ? pageviews / sessions : 0,
    bounceRate: bounce?.total ? (bounce.bounced ?? 0) / bounce.total : 0,
    avgSecondsOnPage: row?.seconds ?? 0,
  };
}

export async function getTraffic(r: Range): Promise<{ current: TrafficSummary; previous: TrafficSummary }> {
  const [current, previous] = await Promise.all([trafficIn(r.from, r.to), trafficIn(r.prevFrom, r.from)]);
  return { current, previous };
}

export interface DayRow {
  day: string;
  pageviews: number;
  visitors: number;
  sessions: number;
}

export async function getDailyTraffic(r: Range): Promise<DayRow[]> {
  return all<DayRow>(sql`
    select ${day("ts")} as day,
           sum(case when name = ${EVENTS.pageview} then 1 else 0 end) as pageviews,
           count(distinct visitorId) as visitors,
           count(distinct nullif(sessionId, '')) as sessions
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to}
    group by day
    order by day
  `);
}

export interface DailyBusinessRow {
  day: string;
  signups: number;
  trades: number;
  traders: number;
  volume: number;
  comments: number;
  marketsAdded: number;
  marketsResolved: number;
}

/** Business metrics per day, straight from the product tables (no tracking needed). */
export async function getDailyBusiness(r: Range): Promise<DailyBusinessRow[]> {
  const rows = await all<DailyBusinessRow>(sql`
    with d as (
      select ${day("createdAt")} as day, count(*) as signups, 0 as trades, 0 as traders,
             0.0 as volume, 0 as comments, 0 as marketsAdded, 0 as marketsResolved
      from user where createdAt >= ${r.from} group by day
      union all
      select ${day("createdAt")}, 0, count(*), count(distinct userId), coalesce(sum(amount), 0), 0, 0, 0
      from trade where createdAt >= ${r.from} group by 1
      union all
      select ${day("createdAt")}, 0, 0, 0, 0, count(*), 0, 0
      from comment where createdAt >= ${r.from} group by 1
      union all
      select ${day("createdAt")}, 0, 0, 0, 0, 0, count(*), 0
      from market where createdAt >= ${r.from} group by 1
      union all
      select ${day("resolvedAt")}, 0, 0, 0, 0, 0, 0, count(*)
      from market where resolvedAt is not null and resolvedAt >= ${r.from} group by 1
    )
    select day,
           sum(signups) as signups, sum(trades) as trades, sum(traders) as traders,
           sum(volume) as volume, sum(comments) as comments,
           sum(marketsAdded) as marketsAdded, sum(marketsResolved) as marketsResolved
    from d group by day order by day
  `);
  return rows;
}

export interface PathRow {
  path: string;
  views: number;
  visitors: number;
  avgSeconds: number;
  bounceRate: number;
}

export async function getTopPages(r: Range, limit = 25): Promise<PathRow[]> {
  return all<PathRow>(sql`
    select p.path,
           p.views,
           p.visitors,
           coalesce(e.seconds, 0) as avgSeconds,
           case when p.sessions > 0 then cast(p.single as real) / p.sessions else 0 end as bounceRate
    from (
      select path,
             count(*) as views,
             count(distinct visitorId) as visitors,
             count(distinct nullif(sessionId, '')) as sessions,
             sum(case when sessionId <> '' and sessionId in (
               select sessionId from analytics_event
               where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and sessionId <> ''
               group by sessionId having count(*) = 1
             ) then 1 else 0 end) as single
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview}
      group by path
    ) p
    left join (
      select path, avg(value / 1000.0) as seconds
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageExit} and value between 0 and 3600000
      group by path
    ) e on e.path = p.path
    order by p.views desc
    limit ${limit}
  `);
}

export interface NamedCount {
  key: string;
  count: number;
  visitors: number;
}

export async function getTopReferrers(r: Range, limit = 15): Promise<NamedCount[]> {
  return all<NamedCount>(sql`
    select case when referrer = '' then '(ישיר)' else referrer end as key,
           count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and referrer <> 'internal'
    group by key order by count desc limit ${limit}
  `);
}

export async function getCampaigns(r: Range, limit = 15): Promise<NamedCount[]> {
  return all<NamedCount>(sql`
    select (source || case when medium = '' then '' else ' / ' || medium end
                    || case when campaign = '' then '' else ' / ' || campaign end) as key,
           count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and (medium <> '' or campaign <> '')
    group by key order by count desc limit ${limit}
  `);
}

export async function getDeviceSplit(r: Range): Promise<NamedCount[]> {
  return all<NamedCount>(sql`
    select case when device = '' then 'unknown' else device end as key,
           count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview}
    group by key order by visitors desc
  `);
}

export async function getCountrySplit(r: Range, limit = 10): Promise<NamedCount[]> {
  return all<NamedCount>(sql`
    select case when country = '' then '??' else country end as key,
           count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview}
    group by key order by visitors desc limit ${limit}
  `);
}

export async function getEventTotals(r: Range): Promise<NamedCount[]> {
  return all<NamedCount>(sql`
    select name as key, count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to}
    group by name order by count desc
  `);
}

/** Clicks on elements carrying data-evt, grouped by that id. */
export async function getClickTotals(r: Range, limit = 25): Promise<NamedCount[]> {
  return all<NamedCount>(sql`
    select coalesce(json_extract(props, '$.id'), '(ללא מזהה)') as key,
           count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.click}
    group by key order by count desc limit ${limit}
  `);
}

export async function getSearchTerms(r: Range, limit = 20): Promise<NamedCount[]> {
  return all<NamedCount>(sql`
    select lower(trim(coalesce(json_extract(props, '$.q'), ''))) as key,
           count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.search}
    group by key having key <> '' order by count desc limit ${limit}
  `);
}

export async function getLiveVisitors(minutes = 5): Promise<number> {
  const row = await one<{ n: number }>(sql`
    select count(distinct visitorId) as n from analytics_event where ts >= ${Date.now() - minutes * 60_000}
  `);
  return row?.n ?? 0;
}

/* -------------------------------- funnel -------------------------------- */

export interface FunnelStage {
  id: string;
  label: string;
  count: number;
  /** conversion from the previous stage */
  rate: number;
}

/**
 * Visitor -> market page -> trade panel -> account -> trade -> repeat trade.
 * The first three stages come from the browser log, the last three from the DB,
 * so an ad-blocker can dent the top of the funnel but never the bottom.
 */
export async function getFunnel(r: Range): Promise<FunnelStage[]> {
  const [v, mv, ta] = await Promise.all([
    one<{ n: number }>(sql`select count(distinct visitorId) as n from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview}`),
    one<{ n: number }>(sql`select count(distinct visitorId) as n from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and marketId is not null`),
    one<{ n: number }>(sql`select count(distinct visitorId) as n from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name in (${EVENTS.tradeAttempt}, ${EVENTS.trade})`),
  ]);
  const signups = await one<{ n: number }>(sql`select count(*) as n from user where createdAt >= ${r.from} and createdAt < ${r.to}`);
  const traders = await one<{ n: number }>(sql`select count(distinct userId) as n from trade where createdAt >= ${r.from} and createdAt < ${r.to}`);
  const repeat = await one<{ n: number }>(sql`
    select count(*) as n from (
      select userId from trade where createdAt >= ${r.from} and createdAt < ${r.to} group by userId having count(*) >= 2
    )`);

  const raw = [
    { id: "visitors", label: "מבקרים", count: v?.n ?? 0 },
    { id: "market_view", label: "פתחו עמוד שוק", count: mv?.n ?? 0 },
    { id: "trade_intent", label: "ניסו לסחור", count: ta?.n ?? 0 },
    { id: "signup", label: "נרשמו", count: signups?.n ?? 0 },
    { id: "trade", label: "ביצעו עסקה", count: traders?.n ?? 0 },
    { id: "repeat", label: "חזרו לעסקה שנייה", count: repeat?.n ?? 0 },
  ];
  // a stage after an empty one has no meaningful conversion — report 0, not 100%
  return raw.map((s, i) => ({ ...s, rate: i === 0 ? 1 : raw[i - 1].count ? s.count / raw[i - 1].count : 0 }));
}

/* ------------------------------- markets -------------------------------- */

export interface MarketMetrics {
  slug: string;
  title: string;
  category: string;
  status: string;
  resolution: string | null;
  probability: number;
  createdBy: string;
  createdAt: number;
  closesAt: number;
  views: number;
  visitors: number;
  trades: number;
  traders: number;
  volume: number;
  comments: number;
  /** traders / unique viewers — how well the question converts curiosity into a bet */
  conversion: number;
}

export async function getMarketMetrics(r: Range, opts: { limit?: number; status?: "open" | "all" } = {}): Promise<MarketMetrics[]> {
  const limit = opts.limit ?? 100;
  const rows = await all<MarketMetrics>(sql`
    select m.id as slug, m.title, m.category, m.status, m.resolution, m.probability,
           m.createdBy, m.createdAt, m.closesAt,
           coalesce(a.views, 0) as views,
           coalesce(a.visitors, 0) as visitors,
           coalesce(t.trades, 0) as trades,
           coalesce(t.traders, 0) as traders,
           coalesce(t.volume, 0) as volume,
           coalesce(c.n, 0) as comments,
           case when coalesce(a.visitors, 0) > 0 then cast(coalesce(t.traders, 0) as real) / a.visitors else 0 end as conversion
    from market m
    left join (
      select marketId, count(*) as views, count(distinct visitorId) as visitors
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and marketId is not null
      group by marketId
    ) a on a.marketId = m.id
    left join (
      select marketId, count(*) as trades, count(distinct userId) as traders, sum(amount) as volume
      from trade where createdAt >= ${r.from} group by marketId
    ) t on t.marketId = m.id
    left join (select marketId, count(*) as n from comment group by marketId) c on c.marketId = m.id
    ${opts.status === "open" ? sql`where m.status = 'open'` : sql``}
    order by (coalesce(a.views, 0) + coalesce(t.trades, 0) * 5) desc, m.createdAt desc
    limit ${limit}
  `);
  return rows;
}

export interface CategoryMetrics {
  category: string;
  markets: number;
  open: number;
  views: number;
  trades: number;
  volume: number;
  avgConversion: number;
}

export async function getCategoryMetrics(r: Range): Promise<CategoryMetrics[]> {
  return all<CategoryMetrics>(sql`
    select m.category,
           count(*) as markets,
           sum(case when m.status = 'open' then 1 else 0 end) as open,
           coalesce(sum(a.views), 0) as views,
           coalesce(sum(t.trades), 0) as trades,
           coalesce(sum(t.volume), 0) as volume,
           case when coalesce(sum(a.visitors), 0) > 0
                then cast(coalesce(sum(t.traders), 0) as real) / sum(a.visitors) else 0 end as avgConversion
    from market m
    left join (
      select marketId, count(*) as views, count(distinct visitorId) as visitors
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and marketId is not null
      group by marketId
    ) a on a.marketId = m.id
    left join (
      select marketId, count(*) as trades, count(distinct userId) as traders, sum(amount) as volume
      from trade where createdAt >= ${r.from} group by marketId
    ) t on t.marketId = m.id
    group by m.category
    order by views desc
  `);
}

/* -------------------------------- users --------------------------------- */

export interface UserStats {
  total: number;
  newInRange: number;
  everTraded: number;
  activeTraders: number;
  repeatTraders: number;
  avgTradesPerTrader: number;
  avgNetWorth: number;
  medianBalance: number;
  commenters: number;
}

export async function getUserStats(r: Range): Promise<UserStats> {
  const row = await one<UserStats>(sql`
    select
      (select count(*) from user) as total,
      (select count(*) from user where createdAt >= ${r.from}) as newInRange,
      (select count(distinct userId) from trade) as everTraded,
      (select count(distinct userId) from trade where createdAt >= ${r.from}) as activeTraders,
      (select count(*) from (select userId from trade where createdAt >= ${r.from} group by userId having count(*) >= 2)) as repeatTraders,
      (select coalesce(avg(n), 0) from (select count(*) as n from trade group by userId)) as avgTradesPerTrader,
      (select coalesce(avg(balance), 0) from user) as avgNetWorth,
      (select coalesce(avg(balance), 0) from (select balance from user order by balance limit 2 - (select count(*) from user) % 2 offset (select (count(*) - 1) / 2 from user))) as medianBalance,
      (select count(distinct userId) from comment) as commenters
  `);
  return (
    row ?? {
      total: 0,
      newInRange: 0,
      everTraded: 0,
      activeTraders: 0,
      repeatTraders: 0,
      avgTradesPerTrader: 0,
      avgNetWorth: 0,
      medianBalance: 0,
      commenters: 0,
    }
  );
}

export interface CohortRow {
  week: string;
  users: number;
  traded: number;
  returned: number;
}

/** Weekly sign-up cohorts: how many ever traded, and how many came back a day later. */
export async function getRetention(weeks = 8): Promise<CohortRow[]> {
  const from = Date.now() - weeks * 7 * 86_400_000;
  return all<CohortRow>(sql`
    select strftime('%Y-W%W', u.createdAt / 1000, 'unixepoch', ${TZ_SHIFT}) as week,
           count(*) as users,
           sum(case when exists (select 1 from trade t where t.userId = u.id) then 1 else 0 end) as traded,
           sum(case when exists (
                 select 1 from trade t where t.userId = u.id and t.createdAt > u.createdAt + 86400000
               ) or exists (
                 select 1 from analytics_event e where e.userId = u.id and e.ts > u.createdAt + 86400000
               ) then 1 else 0 end) as returned
    from user u
    where u.createdAt >= ${from}
    group by week order by week
  `);
}

/* ------------------------------- trading -------------------------------- */

export interface TradingStats {
  trades: number;
  volume: number;
  avgSize: number;
  buys: number;
  sells: number;
  yes: number;
  no: number;
  uniqueMarkets: number;
  biggest: number;
}

export async function getTradingStats(r: Range): Promise<TradingStats> {
  const row = await one<TradingStats>(sql`
    select count(*) as trades,
           coalesce(sum(amount), 0) as volume,
           coalesce(avg(amount), 0) as avgSize,
           sum(case when action = 'BUY' then 1 else 0 end) as buys,
           sum(case when action = 'SELL' then 1 else 0 end) as sells,
           sum(case when side = 'YES' then 1 else 0 end) as yes,
           sum(case when side = 'NO' then 1 else 0 end) as no,
           count(distinct marketId) as uniqueMarkets,
           coalesce(max(amount), 0) as biggest
    from trade where createdAt >= ${r.from} and createdAt < ${r.to}
  `);
  return row ?? { trades: 0, volume: 0, avgSize: 0, buys: 0, sells: 0, yes: 0, no: 0, uniqueMarkets: 0, biggest: 0 };
}

/** Trades by hour of the (Israeli) day — tells the editorial routine when to publish. */
export async function getHourHistogram(r: Range): Promise<{ hour: number; trades: number; pageviews: number }[]> {
  const trades = await all<{ hour: number; n: number }>(sql`
    select cast(strftime('%H', createdAt / 1000, 'unixepoch', ${TZ_SHIFT}) as integer) as hour, count(*) as n
    from trade where createdAt >= ${r.from} group by hour
  `);
  const views = await all<{ hour: number; n: number }>(sql`
    select cast(strftime('%H', ts / 1000, 'unixepoch', ${TZ_SHIFT}) as integer) as hour, count(*) as n
    from analytics_event where ts >= ${r.from} and name = ${EVENTS.pageview} group by hour
  `);
  const t = new Map(trades.map((x) => [x.hour, x.n]));
  const v = new Map(views.map((x) => [x.hour, x.n]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, trades: t.get(hour) ?? 0, pageviews: v.get(hour) ?? 0 }));
}

/* ----------------------------- performance ------------------------------ */

export interface VitalRow {
  metric: string;
  samples: number;
  p50: number;
  p75: number;
  p95: number;
}

export async function getWebVitals(r: Range): Promise<VitalRow[]> {
  return all<VitalRow>(sql`
    select json_extract(props, '$.metric') as metric,
           count(*) as samples,
           avg(value) as p50,
           max(value) as p95,
           avg(value) as p75
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.webVital} and value is not null
    group by metric order by samples desc
  `).then(async (rows) => {
    // SQLite has no percentile_cont, so refine p50/p75 per metric with a window query
    const out: VitalRow[] = [];
    for (const row of rows) {
      const q = await all<{ p50: number; p75: number; p95: number }>(sql`
        with v as (
          select value, row_number() over (order by value) as rn, count(*) over () as n
          from analytics_event
          where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.webVital}
            and json_extract(props, '$.metric') = ${row.metric} and value is not null
        )
        select
          (select value from v where rn >= (n * 50 + 99) / 100 limit 1) as p50,
          (select value from v where rn >= (n * 75 + 99) / 100 limit 1) as p75,
          (select value from v where rn >= (n * 95 + 99) / 100 limit 1) as p95
      `);
      out.push({ ...row, p50: q[0]?.p50 ?? row.p50, p75: q[0]?.p75 ?? row.p75, p95: q[0]?.p95 ?? row.p95 });
    }
    return out;
  });
}

export async function getSlowPages(r: Range, limit = 10): Promise<{ path: string; samples: number; avgLcp: number }[]> {
  return all<{ path: string; samples: number; avgLcp: number }>(sql`
    select path, count(*) as samples, avg(value) as avgLcp
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.webVital}
      and json_extract(props, '$.metric') = 'LCP' and value is not null
    group by path having samples >= 3 order by avgLcp desc limit ${limit}
  `);
}

export async function getClientErrors(r: Range, limit = 20): Promise<{ message: string; count: number; path: string }[]> {
  return all<{ message: string; count: number; path: string }>(sql`
    select coalesce(json_extract(props, '$.message'), '(ללא הודעה)') as message,
           count(*) as count,
           max(path) as path
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.clientError}
    group by message order by count desc limit ${limit}
  `);
}

/* ------------------------ editorial / market quality --------------------- */

export interface Calibration {
  resolved: number;
  /** Brier score of the price the question opened with (0 = perfect, 0.25 = coin flip) */
  brierInitial: number;
  /** Brier score of the last market price before resolution */
  brierFinal: number;
  yesRate: number;
  avgHoursOpen: number;
}

export async function getCalibration(): Promise<Calibration> {
  const rows = await all<{ p0: number; p1: number; y: number; hours: number }>(sql`
    select
      (select probability from price_history ph where ph.marketId = m.id order by ph.ts asc limit 1) as p0,
      coalesce((select probability from price_history ph where ph.marketId = m.id and ph.ts < m.resolvedAt order by ph.ts desc limit 1), m.probability) as p1,
      case when m.resolution = 'YES' then 1 else 0 end as y,
      (m.resolvedAt - m.createdAt) / 3600000.0 as hours
    from market m
    where m.status = 'resolved' and m.resolution is not null and m.resolvedAt is not null
  `);
  if (!rows.length) return { resolved: 0, brierInitial: 0, brierFinal: 0, yesRate: 0, avgHoursOpen: 0 };
  const n = rows.length;
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    resolved: n,
    brierInitial: sum((r) => ((r.p0 ?? 0.5) - r.y) ** 2) / n,
    brierFinal: sum((r) => ((r.p1 ?? 0.5) - r.y) ** 2) / n,
    yesRate: sum((r) => r.y) / n,
    avgHoursOpen: sum((r) => r.hours ?? 0) / n,
  };
}

export interface ContentHealth {
  open: number;
  resolved: number;
  cancelled: number;
  overdue: number;
  closingSoon: number;
  noTrades: number;
  addedLast7d: number;
  resolvedLast7d: number;
  lastRunAt: number | null;
}

export async function getContentHealth(): Promise<ContentHealth> {
  const now = Date.now();
  const row = await one<ContentHealth>(sql`
    select
      sum(case when status = 'open' then 1 else 0 end) as open,
      sum(case when status = 'resolved' then 1 else 0 end) as resolved,
      sum(case when status = 'cancelled' then 1 else 0 end) as cancelled,
      sum(case when status = 'open' and closesAt < ${now} then 1 else 0 end) as overdue,
      sum(case when status = 'open' and closesAt between ${now} and ${now + 86_400_000} then 1 else 0 end) as closingSoon,
      sum(case when status = 'open' and tradeCount = 0 then 1 else 0 end) as noTrades,
      sum(case when createdAt >= ${now - 7 * 86_400_000} then 1 else 0 end) as addedLast7d,
      sum(case when resolvedAt >= ${now - 7 * 86_400_000} then 1 else 0 end) as resolvedLast7d,
      (select max(createdAt) from agent_run) as lastRunAt
    from market
  `);
  return (
    row ?? {
      open: 0,
      resolved: 0,
      cancelled: 0,
      overdue: 0,
      closingSoon: 0,
      noTrades: 0,
      addedLast7d: 0,
      resolvedLast7d: 0,
      lastRunAt: null,
    }
  );
}

export async function getAgentRuns(limit = 20) {
  return all<{ id: number; source: string; summary: string; added: number; updated: number; resolved: number; ok: number; createdAt: number }>(sql`
    select id, source, summary, added, updated, resolved, ok, createdAt
    from agent_run order by createdAt desc limit ${limit}
  `);
}

/* -------------------------------- issues -------------------------------- */

export interface Issue {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** where to look in the repo when fixing it */
  hint: string;
}

/**
 * The dashboard's "what to fix" list — also the most useful part of the export
 * for an agent that is asked to improve the site.
 */
export async function getIssues(r: Range): Promise<Issue[]> {
  const [health, funnel, traffic, vitals, errors, markets] = await Promise.all([
    getContentHealth(),
    getFunnel(r),
    getTraffic(r),
    getWebVitals(r),
    getClientErrors(r, 5),
    getMarketMetrics(r, { limit: 300, status: "open" }),
  ]);
  const issues: Issue[] = [];
  const stage = (id: string) => funnel.find((s) => s.id === id);

  if (traffic.current.events === 0) {
    issues.push({
      id: "no-events",
      severity: "high",
      title: "אין אירועי אנליטיקה בטווח הנבחר",
      detail: "לא נרשם אף אירוע. ייתכן שהמעקב לא נטען, שחוסם פרסומות חוסם את /api/analytics/collect, או שהאתר פשוט לא קיבל תנועה.",
      hint: "src/components/Analytics.tsx, src/app/api/analytics/collect/route.ts",
    });
  }
  if (health.overdue > 0) {
    issues.push({
      id: "overdue-markets",
      severity: "high",
      title: `${health.overdue} שווקים עברו את מועד הסגירה ולא הוכרעו`,
      detail: "שוק שסגור אבל לא הוכרע מקפיא כסף של סוחרים ופוגע באמון. ההכרעה היא באחריות רוטינת העדכון.",
      hint: "AGENT.md → הכרעת שוק קיים, data/markets.json",
    });
  }
  const dead = markets.filter((m) => m.trades === 0 && m.views >= 10);
  if (dead.length) {
    issues.push({
      id: "views-no-trades",
      severity: "medium",
      title: `${dead.length} שווקים נצפו אך לא נסחרו כלל`,
      detail: `לדוגמה: ${dead.slice(0, 3).map((m) => m.title).join(" · ")}. שאלה שנצפית ולא נסחרת היא בדרך כלל לא ברורה, לא מעניינת, או מתומחרת קיצוני.`,
      hint: "src/components/TradePanel.tsx, AGENT.md → סגנון השאלות",
    });
  }
  if (health.noTrades > health.open * 0.5 && health.open > 4) {
    issues.push({
      id: "many-empty-markets",
      severity: "medium",
      title: `${health.noTrades} מתוך ${health.open} השווקים הפתוחים בלי אף עסקה`,
      detail: "יותר מדי שאלות פתוחות בבת אחת מפזרות את הנזילות. שקלו פחות שאלות, חדות יותר, עם מועד סגירה קרוב.",
      hint: "AGENT.md → תמהיל מועדים",
    });
  }
  const view = stage("market_view");
  const intent = stage("trade_intent");
  if (view && intent && view.count >= 20 && intent.count / Math.max(1, view.count) < 0.1) {
    issues.push({
      id: "low-trade-intent",
      severity: "high",
      title: "פחות מ-10% מהמבקרים בעמוד שוק מנסים לסחור",
      detail: `${intent.count} מתוך ${view.count}. פאנל המסחר, ההסבר או הצורך בהתחברות הם החשודים המיידיים.`,
      hint: "src/components/TradePanel.tsx, src/components/HowToPlay.tsx",
    });
  }
  const signup = stage("signup");
  const trade = stage("trade");
  if (signup && trade && signup.count >= 5 && trade.count / Math.max(1, signup.count) < 0.5) {
    issues.push({
      id: "signup-no-trade",
      severity: "medium",
      title: "פחות ממחצית הנרשמים ביצעו עסקה",
      detail: `${trade.count} סוחרים מתוך ${signup.count} נרשמים בטווח. כדאי onboarding שמוביל ישר לעסקה ראשונה.`,
      hint: "src/app/login/page.tsx, src/components/HowToPlay.tsx",
    });
  }
  if (traffic.current.bounceRate > 0.7 && traffic.current.sessions >= 20) {
    issues.push({
      id: "high-bounce",
      severity: "medium",
      title: `שיעור נטישה גבוה (${Math.round(traffic.current.bounceRate * 100)}%)`,
      detail: "רוב הסשנים נגמרים אחרי עמוד אחד. בדקו את עמוד הנחיתה, את מהירות הטעינה ואת רלוונטיות השאלות המוצגות ראשונות.",
      hint: "src/app/page.tsx",
    });
  }
  const lcp = vitals.find((v) => v.metric === "LCP");
  if (lcp && lcp.samples >= 10 && lcp.p75 > 2500) {
    issues.push({
      id: "slow-lcp",
      severity: "medium",
      title: `LCP איטי (p75 = ${Math.round(lcp.p75)}ms)`,
      detail: "מעל 2.5 שניות נחשב איטי ופוגע גם בדירוג בגוגל וגם בהמרה.",
      hint: "src/app/page.tsx, src/components/MarketCard.tsx, next.config.ts",
    });
  }
  if (errors.length && errors[0].count >= 5) {
    issues.push({
      id: "client-errors",
      severity: "high",
      title: `שגיאת דפדפן חוזרת: ${errors[0].message.slice(0, 80)}`,
      detail: `${errors[0].count} מופעים בטווח, לרוב בעמוד ${errors[0].path}.`,
      hint: "src/instrumentation-client.ts",
    });
  }
  if (health.closingSoon === 0 && health.open > 0) {
    issues.push({
      id: "nothing-closing-soon",
      severity: "low",
      title: "אין אף שוק שנסגר ב-24 השעות הקרובות",
      detail: "שאלות שנסגרות מהר הן מה שמחזיר אנשים לאתר כל יום.",
      hint: "AGENT.md → תמהיל מועדים",
    });
  }
  return issues;
}
