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
  /** conversion from the previous stage; null where the two stages count different units */
  rate: number | null;
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

/* ----------------------------- paid traffic ------------------------------ */

/**
 * The funnel for visitors who arrived from a campaign, session by session.
 *
 * The general funnel above starts at "מבקרים" and counts market pages and trade
 * attempts — the path an organic visitor takes. A paid visitor takes a different
 * one: the ad → /welcome → the deck → the free run → the sign-in screen → an
 * account → a first trade. Every step of that path leaves a first-party event with
 * the same `sessionId`, and the landing pageview is the only one that carries the
 * campaign (`utm_*` lives on the ad's URL and is gone after the first client-side
 * navigation), so "a paid session" is exactly "a session whose pageview carried a
 * medium". The last two stages come from the user table, where `claimAdAttribution`
 * stamped the campaign cookie on the account, so they are counted in accounts, not
 * sessions — the labels say so.
 */
export interface PaidFunnel {
  /** distinct browser-days behind the paid sessions */
  visitors: number;
  /**
   * Ad clicks the server saw arrive on /welcome (`landing`, written while the page
   * renders). Not a stage: it has no session id. Its distance from the first stage
   * is the loss the browser never reports — taps abandoned before hydration, and
   * content blockers that swallow the collector.
   */
  landings: number;
  stages: FunnelStage[];
}

/** a pageview whose query carried a campaign medium — the ad click itself */
const PAID_PAGEVIEW = (r: Range) => sql`
  select distinct sessionId from analytics_event
  where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and sessionId <> '' and medium <> ''
`;

/**
 * An account the campaign earned: stamped with a medium by `claimAdAttribution`, or
 * with a bare gclid — Google's auto-tagging can send a click with no utm_* at all.
 */
const PAID_ACCOUNT = sql`(coalesce(u.utmMedium, '') <> '' or u.gclid is not null)`;

export async function getPaidFunnel(r: Range): Promise<PaidFunnel> {
  const paid = PAID_PAGEVIEW(r);
  const count = (cond: SQL) =>
    one<{ n: number }>(sql`
      select count(distinct e.sessionId) as n from analytics_event e
      where e.ts >= ${r.from} and e.ts < ${r.to} and e.sessionId in (${paid}) and ${cond}
    `).then((row) => row?.n ?? 0);

  const [landings, sessions, visitors, touched, deck, answered, gate, login, signups, traders] = await Promise.all([
    one<{ n: number }>(sql`
      select count(*) as n from analytics_event where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.landing}
    `).then((row) => row?.n ?? 0),
    one<{ n: number }>(sql`select count(*) as n from (${paid})`).then((row) => row?.n ?? 0),
    one<{ n: number }>(sql`
      select count(distinct visitorId) as n from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and medium <> ''
    `).then((row) => row?.n ?? 0),
    // did anything at all during the visit: a marked click, a search, a share, an answer on a card
    count(sql`e.name in (${EVENTS.click}, ${EVENTS.search}, ${EVENTS.guestAnswer}, ${EVENTS.share})`),
    count(sql`e.name = ${EVENTS.pageview} and e.path = '/rapid'`),
    count(sql`e.name = ${EVENTS.guestAnswer}`),
    count(sql`e.name = ${EVENTS.guestGate}`),
    count(sql`e.name = ${EVENTS.pageview} and e.path = '/login'`),
    one<{ n: number }>(sql`
      select count(*) as n from user u where u.createdAt >= ${r.from} and u.createdAt < ${r.to} and ${PAID_ACCOUNT}
    `).then((row) => row?.n ?? 0),
    one<{ n: number }>(sql`
      select count(*) as n from user u
      where u.createdAt >= ${r.from} and u.createdAt < ${r.to} and ${PAID_ACCOUNT}
        and exists (select 1 from trade t where t.userId = u.id)
    `).then((row) => row?.n ?? 0),
  ]);

  // the first five stages are sessions; the last two are accounts, and a percentage
  // across that boundary would be arithmetic rather than a conversion — hence null
  const raw: { id: string; label: string; count: number; unitBreak?: boolean }[] = [
    { id: "paid_sessions", label: "נחתו מקמפיין (סשנים)", count: sessions },
    { id: "paid_touched", label: "עשו משהו בביקור", count: touched },
    { id: "paid_deck", label: "הגיעו לחפיסה", count: deck },
    { id: "paid_answered", label: "ענו על שאלה (כאורחים)", count: answered },
    { id: "paid_gate", label: "ראו את החסימה בסוף הריצה", count: gate },
    { id: "paid_login", label: "הגיעו למסך ההתחברות", count: login },
    { id: "paid_signup", label: "נרשמו (חשבונות עם שיוך לקמפיין)", count: signups, unitBreak: true },
    { id: "paid_trade", label: "ביצעו עסקה", count: traders },
  ];
  return {
    visitors,
    landings,
    stages: raw.map(({ unitBreak, ...s }, i) => ({
      ...s,
      rate: i === 0 ? 1 : unitBreak ? null : raw[i - 1].count ? s.count / raw[i - 1].count : 0,
    })),
  };
}

/* ---------------------------- the landing page itself ---------------------- */

export interface LandingEngagement {
  /** paid sessions that left a page_exit on /welcome */
  exits: number;
  /** seconds on the landing page: the median, and the share of visits in each band */
  medianSeconds: number;
  under5s: number;
  under15s: number;
  under60s: number;
  over60s: number;
  /** average deepest scroll, 0–1 */
  avgScroll: number;
  /** average deepest scroll among the sessions that never touched anything — did they even see the card? */
  avgScrollUntouched: number;
}

/**
 * What a paid visitor did on /welcome before leaving — the distribution, not the mean.
 *
 * "34 seconds on page" was a mean over the exits the browser managed to send, and
 * a mean cannot tell a page that is read and declined from one that is glanced at
 * and closed with a few long visits pulling the number up. The scroll depth has
 * been recorded on every exit since the first day and aggregated nowhere; for the
 * sessions that never touched anything it answers the only question that matters
 * for the landing page — whether the card was ever on the screen.
 */
export async function getLandingEngagement(r: Range): Promise<LandingEngagement> {
  const paid = PAID_PAGEVIEW(r);
  const row = await one<{
    exits: number;
    under5: number;
    under15: number;
    under60: number;
    over60: number;
    scroll: number | null;
  }>(sql`
    select count(*) as exits,
           sum(case when value < 5000 then 1 else 0 end) as under5,
           sum(case when value >= 5000 and value < 15000 then 1 else 0 end) as under15,
           sum(case when value >= 15000 and value < 60000 then 1 else 0 end) as under60,
           sum(case when value >= 60000 then 1 else 0 end) as over60,
           avg(json_extract(props, '$.scroll')) as scroll
    from analytics_event e
    where e.ts >= ${r.from} and e.ts < ${r.to} and e.name = ${EVENTS.pageExit} and e.path = '/welcome'
      and e.value between 0 and 3600000 and e.sessionId in (${paid})
  `);
  const median = await one<{ v: number | null }>(sql`
    with v as (
      select value, row_number() over (order by value) as rn, count(*) over () as n
      from analytics_event e
      where e.ts >= ${r.from} and e.ts < ${r.to} and e.name = ${EVENTS.pageExit} and e.path = '/welcome'
        and e.value between 0 and 3600000 and e.sessionId in (${paid})
    )
    select value as v from v where rn >= (n * 50 + 99) / 100 limit 1
  `);
  const untouched = await one<{ scroll: number | null }>(sql`
    select avg(json_extract(e.props, '$.scroll')) as scroll
    from analytics_event e
    where e.ts >= ${r.from} and e.ts < ${r.to} and e.name = ${EVENTS.pageExit} and e.path = '/welcome'
      and e.sessionId in (${paid})
      and not exists (
        select 1 from analytics_event t
        where t.sessionId = e.sessionId and t.ts >= ${r.from} and t.ts < ${r.to}
          and t.name in (${EVENTS.click}, ${EVENTS.search}, ${EVENTS.guestAnswer}, ${EVENTS.share})
      )
  `);
  const exits = row?.exits ?? 0;
  const share = (n: number | undefined) => (exits ? (n ?? 0) / exits : 0);
  return {
    exits,
    medianSeconds: Math.round((median?.v ?? 0) / 100) / 10,
    under5s: share(row?.under5),
    under15s: share(row?.under15),
    under60s: share(row?.under60),
    over60s: share(row?.over60),
    avgScroll: row?.scroll ?? 0,
    avgScrollUntouched: untouched?.scroll ?? 0,
  };
}

/** The paid funnel's first steps, one row per ad group (`utm_content`, which Google fills with {adgroupid}). */
export async function getPaidAdGroups(r: Range, limit = 12): Promise<{ key: string; sessions: number; touched: number; deck: number }[]> {
  return all<{ key: string; sessions: number; touched: number; deck: number }>(sql`
    with landing as (
      select sessionId,
             campaign || ' / ' || coalesce(nullif(json_extract(props, '$.content'), ''), '?') as key
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and sessionId <> '' and medium <> ''
      group by sessionId
    )
    select l.key,
           count(*) as sessions,
           sum(case when exists (select 1 from analytics_event e where e.sessionId = l.sessionId and e.ts >= ${r.from} and e.ts < ${r.to}
                                 and e.name in (${EVENTS.click}, ${EVENTS.search}, ${EVENTS.guestAnswer}, ${EVENTS.share})) then 1 else 0 end) as touched,
           sum(case when exists (select 1 from analytics_event e where e.sessionId = l.sessionId and e.ts >= ${r.from} and e.ts < ${r.to}
                                 and e.name = ${EVENTS.pageview} and e.path = '/rapid') then 1 else 0 end) as deck
    from landing l
    group by l.key
    order by sessions desc
    limit ${limit}
  `);
}

export interface PaidCampaignRow {
  /** source / medium / campaign — the same key `getCampaigns` prints */
  key: string;
  sessions: number;
  /** sessions with a second pageview */
  engaged: number;
  deck: number;
  answered: number;
  login: number;
  /** accounts stamped with this campaign (user table), created in the range */
  signups: number;
  /** of those, accounts with at least one trade */
  traders: number;
}

/** The same funnel, one row per campaign key, so two ad groups can be told apart. */
export async function getPaidCampaigns(r: Range, limit = 15): Promise<PaidCampaignRow[]> {
  // `key` beside min(ts) in a GROUP BY is SQLite's bare-column rule: the row that holds
  // the minimum supplies the other columns, i.e. the session's first tagged pageview
  const rows = await all<Omit<PaidCampaignRow, "signups" | "traders">>(sql`
    with landing as (
      select sessionId,
             (source || case when medium = '' then '' else ' / ' || medium end
                     || case when campaign = '' then '' else ' / ' || campaign end) as key,
             min(ts) as t0
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and sessionId <> '' and medium <> ''
      group by sessionId
    )
    select l.key,
           count(*) as sessions,
           sum(case when (select count(*) from analytics_event e where e.sessionId = l.sessionId and e.name = ${EVENTS.pageview} and e.ts >= ${r.from} and e.ts < ${r.to}) >= 2 then 1 else 0 end) as engaged,
           sum(case when exists (select 1 from analytics_event e where e.sessionId = l.sessionId and e.name = ${EVENTS.pageview} and e.path = '/rapid' and e.ts >= ${r.from} and e.ts < ${r.to}) then 1 else 0 end) as deck,
           sum(case when exists (select 1 from analytics_event e where e.sessionId = l.sessionId and e.name = ${EVENTS.guestAnswer} and e.ts >= ${r.from} and e.ts < ${r.to}) then 1 else 0 end) as answered,
           sum(case when exists (select 1 from analytics_event e where e.sessionId = l.sessionId and e.name = ${EVENTS.pageview} and e.path = '/login' and e.ts >= ${r.from} and e.ts < ${r.to}) then 1 else 0 end) as login
    from landing l
    group by l.key
    order by sessions desc
    limit ${limit}
  `);
  const accounts = await all<{ key: string; signups: number; traders: number }>(sql`
    select (coalesce(utmSource, '') || case when coalesce(utmMedium, '') = '' then '' else ' / ' || utmMedium end
                                    || case when coalesce(utmCampaign, '') = '' then '' else ' / ' || utmCampaign end) as key,
           count(*) as signups,
           sum(case when exists (select 1 from trade t where t.userId = u.id) then 1 else 0 end) as traders
    from user u
    where u.createdAt >= ${r.from} and u.createdAt < ${r.to} and ${PAID_ACCOUNT}
    group by key
  `);
  const byKey = new Map(accounts.map((a) => [a.key, a]));
  const out: PaidCampaignRow[] = rows.map((row) => ({
    ...row,
    signups: byKey.get(row.key)?.signups ?? 0,
    traders: byKey.get(row.key)?.traders ?? 0,
  }));
  // an account whose campaign sent no session in the range (a cookie from an earlier
  // click) still deserves a row, or the signup would vanish from the report
  for (const a of accounts) {
    if (!rows.some((row) => row.key === a.key)) {
      out.push({ key: a.key, sessions: 0, engaged: 0, deck: 0, answered: 0, login: 0, signups: a.signups, traders: a.traders });
    }
  }
  return out;
}

/**
 * Browser languages of the paid visitors — the nearest thing to a country the log
 * has (see `browserLang` in Analytics.tsx). "?" is a pageview recorded before the
 * field existed.
 */
export async function getPaidLanguages(r: Range, limit = 8): Promise<NamedCount[]> {
  return all<NamedCount>(sql`
    select coalesce(nullif(json_extract(props, '$.lang'), ''), '?') as key,
           count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and medium <> ''
    group by key order by visitors desc limit ${limit}
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
export async function getIssues(r: Range, precomputed: { paid?: PaidFunnel } = {}): Promise<Issue[]> {
  const [health, funnel, traffic, vitals, errors, markets, paid, pages] = await Promise.all([
    getContentHealth(),
    getFunnel(r),
    getTraffic(r),
    getWebVitals(r),
    getClientErrors(r, 5),
    getMarketMetrics(r, { limit: 300, status: "open" }),
    precomputed.paid ?? getPaidFunnel(r),
    getTopPages(r, 6),
  ]);
  const issues: Issue[] = [];
  const stage = (id: string) => funnel.find((s) => s.id === id);
  const paidStage = (id: string) => paid.stages.find((s) => s.id === id)?.count ?? 0;

  // the campaign is paying for every one of these sessions, so the two silences that
  // matter most — nobody touches the landing page, nobody opens an account — are
  // flagged as soon as there are enough sessions to mean something
  const paidSessions = paidStage("paid_sessions");
  if (paidSessions >= 10 && paidStage("paid_touched") / paidSessions < 0.25) {
    issues.push({
      id: "paid-no-touch",
      severity: "high",
      title: `${Math.round((1 - paidStage("paid_touched") / paidSessions) * 100)}% מהמבקרים מהקמפיין עוזבים בלי לגעת בכלום`,
      detail: `${paidStage("paid_touched")} מתוך ${paidSessions} סשנים מהקמפיין עשו משהו בביקור. מה שהמודעה הבטיחה חייב להיות הדבר הראשון שאפשר לעשות בדף — ולא טקסט.`,
      hint: "src/app/welcome/page.tsx, src/components/WelcomeQuestions.tsx",
    });
  }
  const paidSignups = paidStage("paid_signup");
  if ((paidSessions >= 40 && paidSignups === 0) || (paidSessions >= 100 && paidSignups / paidSessions < 0.01)) {
    issues.push({
      id: "paid-no-signup",
      severity: "high",
      title: paidSignups === 0 ? "אף חשבון לא נפתח מתנועת הקמפיין" : `פחות מאחוז מסשני הקמפיין הופכים לחשבון (${paidSignups} מתוך ${paidSessions})`,
      detail: `${paidSessions} סשנים מהקמפיין, ${paidStage("paid_deck")} הגיעו לחפיסה, ${paidStage("paid_answered")} ענו, ${paidStage("paid_gate")} ראו את החסימה, ${paidStage("paid_login")} הגיעו למסך ההתחברות — ${paidSignups} חשבונות עם שיוך לקמפיין. הנקודה שבה המספר נופל היא המקום לתקן.`,
      hint: "src/components/RapidDeck.tsx (GuestGate, GuestSoftAsk), src/components/GuestRunBanner.tsx, src/app/login/page.tsx",
    });
  }
  if (paid.landings >= 20 && paidSessions / paid.landings < 0.7) {
    issues.push({
      id: "paid-lost-before-js",
      severity: "medium",
      title: `${Math.round((1 - paidSessions / paid.landings) * 100)}% מהקליקים על המודעה לא הפכו לסשן מדוד`,
      detail: `${paid.landings} נחיתות נרשמו בשרת, ${paidSessions} סשנים נמדדו בדפדפן. ההפרש הוא מי שעזב לפני שה-JavaScript רץ (זמן טעינה) או שחוסם תוכן בלע את המדידה — ולא ״נטישה״ של הדף.`,
      hint: "src/app/welcome/page.tsx (זמן שרת), src/components/Analytics.tsx",
    });
  }

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
    // name the page that carries the bounce, not the home page by default: a campaign
    // landing page with most of the visitors is where the site-wide number comes from
    const worst = [...pages].sort((a, b) => b.views * b.bounceRate - a.views * a.bounceRate)[0];
    issues.push({
      id: "high-bounce",
      severity: "medium",
      title: `שיעור נטישה גבוה (${Math.round(traffic.current.bounceRate * 100)}%)`,
      detail: `רוב הסשנים נגמרים אחרי עמוד אחד${worst ? ` — בעיקר ב-${worst.path} (${Math.round(worst.bounceRate * 100)}% מ-${worst.views} צפיות)` : ""}. בדקו את עמוד הנחיתה, את מהירות הטעינה ואת רלוונטיות השאלות המוצגות ראשונות.`,
      hint: worst?.path === "/welcome" ? "src/app/welcome/page.tsx" : "src/app/page.tsx",
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
