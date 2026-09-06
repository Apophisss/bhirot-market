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

/* ----------------------------- prop breakdowns --------------------------- */

/**
 * Counts one (or two) props of one event, most common first.
 *
 * Half the site's props have been collected since the day they were added and
 * summarised nowhere: `webview`, `first`, `install_app.action`, `login_error.error`.
 * They are all the same question — "how does this split?" — so they get one query
 * rather than seven near-identical ones. The JSON path is a bound parameter and
 * never string-built, and a missing value is reported as "?" rather than dropped: a
 * prop absent from half the rows is itself the finding (a field added later, or an
 * event fired from somewhere that does not set it).
 */
export async function getPropBreakdown(
  r: Range,
  event: string,
  props: string | string[],
  opts: { limit?: number; extra?: SQL } = {},
): Promise<NamedCount[]> {
  const parts = (Array.isArray(props) ? props : [props]).map(
    (p) => sql`coalesce(nullif(cast(json_extract(props, ${`$.${p}`}) as text), ''), '?')`,
  );
  return all<NamedCount>(sql`
    select ${sql.join(parts, sql` || ' · ' || `)} as key,
           count(*) as count, count(distinct visitorId) as visitors
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${event} ${opts.extra ?? sql``}
    group by key order by count desc limit ${opts.limit ?? 20}
  `);
}

export interface PropBreakdowns {
  /** pageview.first — 1 is this browser's first ever visit, 0 a returning one */
  firstVisit: NamedCount[];
  /** pageview.webview — 1 is an embedded in-app browser */
  webview: NamedCount[];
  /** install_app.action, crossed with the platform it was offered on */
  installApp: NamedCount[];
  /** trade_error.reason — why an answer was refused */
  tradeErrors: NamedCount[];
  /** login_error.error — what the provider came back with */
  loginErrors: NamedCount[];
  /** survey.status */
  survey: NamedCount[];
  /** guest_gate.n — how many answers were behind the wall when it went up */
  guestGate: NamedCount[];
  /** landing.webview — the same in-app question, on the server's own row */
  landingWebview: NamedCount[];
  /** landing.lang — the browser language the ad click arrived with */
  landingLang: NamedCount[];
}

/**
 * The props that are already collected and were never aggregated.
 *
 * `webview` is the one to read first: Google's sign-in refuses some in-app
 * browsers outright, and Demand Gen serves inside exactly those apps — so a paid
 * visitor can be unable to open an account for a reason that appears in no other
 * metric, and the share of pageviews arriving inside one is the size of that hole.
 * `first` says how much of the traffic is new; the two error breakdowns say whether
 * something is refusing people at the moment they finally tried.
 */
export async function getPropBreakdowns(r: Range): Promise<PropBreakdowns> {
  const [firstVisit, webview, installApp, tradeErrors, loginErrors, survey, guestGate, landingWebview, landingLang] = await Promise.all([
    getPropBreakdown(r, EVENTS.pageview, "first", { limit: 4 }),
    getPropBreakdown(r, EVENTS.pageview, "webview", { limit: 4 }),
    getPropBreakdown(r, EVENTS.installApp, ["action", "platform"], { limit: 20 }),
    getPropBreakdown(r, EVENTS.tradeError, "reason", { limit: 15 }),
    getPropBreakdown(r, EVENTS.loginError, "error", { limit: 15 }),
    getPropBreakdown(r, EVENTS.survey, "status", { limit: 10 }),
    getPropBreakdown(r, EVENTS.guestGate, "n", { limit: 15 }),
    getPropBreakdown(r, EVENTS.landing, "webview", { limit: 4 }),
    getPropBreakdown(r, EVENTS.landing, "lang", { limit: 10 }),
  ]);
  return { firstVisit, webview, installApp, tradeErrors, loginErrors, survey, guestGate, landingWebview, landingLang };
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
 * An answer given inside the deck, whoever gave it.
 *
 * A signed-in answer is a trade the rapid endpoint stamped as such
 * (`src/app/api/rapid/answer/route.ts` writes `props.rapid`), and a guest's answer
 * never becomes a trade at all — it lives in the browser until sign-in, and
 * `guest_answer` with `surface=deck` is the only record that it happened.
 */
const DECK_ANSWER = sql`(
  (name = ${EVENTS.trade} and json_extract(props, '$.rapid') = 1)
  or (name = ${EVENTS.guestAnswer} and json_extract(props, '$.surface') = 'deck')
)`;

/**
 * Visitor -> saw a question -> tried to answer -> account -> trade -> repeat trade.
 * The first stages come from the browser log, the last three from the DB, so an
 * ad-blocker can dent the top of the funnel but never the bottom.
 *
 * The second stage used to count market pages alone, which was the funnel measuring
 * a path most of the traffic no longer takes: rapid mode answers a question without
 * ever opening its page, so a visitor who played the deck for five minutes fell out
 * of the funnel at stage two and the drop printed there was an artifact of the
 * measurement rather than anything a visitor did. "Saw a question" is now a market
 * page *or* the deck, and "ניסו לענות" counts the deck's answers beside the trade
 * panel's — with the deck's own share printed under it.
 *
 * Every stage is a subset of the one above it, deliberately: a stage that is not
 * cannot have a conversion rate, only a ratio, and a ratio over 100% printed as a
 * conversion is how the old per-market number came to read 400%.
 */
export async function getFunnel(r: Range): Promise<FunnelStage[]> {
  const [v, mv, ta, deck] = await Promise.all([
    one<{ n: number }>(sql`select count(distinct visitorId) as n from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview}`),
    one<{ n: number }>(sql`select count(distinct visitorId) as n from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview}
        and (marketId is not null or path = '/rapid')`),
    one<{ n: number }>(sql`select count(distinct visitorId) as n from analytics_event
      where ts >= ${r.from} and ts < ${r.to}
        and (name in (${EVENTS.tradeAttempt}, ${EVENTS.trade}) or ${DECK_ANSWER})`),
    one<{ n: number }>(sql`select count(distinct visitorId) as n from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and ${DECK_ANSWER}`),
  ]);
  const signups = await one<{ n: number }>(sql`select count(*) as n from user where createdAt >= ${r.from} and createdAt < ${r.to}`);
  const traders = await one<{ n: number }>(sql`select count(distinct userId) as n from trade where createdAt >= ${r.from} and createdAt < ${r.to}`);
  const repeat = await one<{ n: number }>(sql`
    select count(*) as n from (
      select userId from trade where createdAt >= ${r.from} and createdAt < ${r.to} group by userId having count(*) >= 2
    )`);

  // `signup` is the same unit break the paid funnel marks: everything above it is
  // browser-days, everything from it down is accounts, and a percentage across that
  // line is arithmetic and not a conversion
  const raw: { id: string; label: string; count: number; unitBreak?: boolean }[] = [
    { id: "visitors", label: "מבקרים", count: v?.n ?? 0 },
    { id: "question_view", label: "ראו שאלה (דף שאלה או חפיסה)", count: mv?.n ?? 0 },
    { id: "trade_intent", label: "ניסו לענות (בחפיסה או בפאנל המסחר)", count: ta?.n ?? 0 },
    { id: "deck_answer", label: "מתוכם: ענו בחפיסה", count: deck?.n ?? 0 },
    { id: "signup", label: "נרשמו", count: signups?.n ?? 0, unitBreak: true },
    { id: "trade", label: "ביצעו עסקה", count: traders?.n ?? 0 },
    { id: "repeat", label: "חזרו לעסקה שנייה", count: repeat?.n ?? 0 },
  ];
  // a stage after an empty one has no meaningful conversion — report 0, not 100%
  return raw.map(({ unitBreak, ...s }, i) => ({
    ...s,
    rate: i === 0 ? 1 : unitBreak ? null : raw[i - 1].count ? s.count / raw[i - 1].count : 0,
  }));
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
  /** views of the question's own page */
  views: number;
  /** visitors to the question's own page */
  visitors: number;
  /**
   * Everyone the question was actually put in front of: its page, or the deck.
   * The deck shows a question without opening its page, so page visitors alone are
   * not the audience — and using them as the denominator is what printed 200% and
   * 400% conversions for questions that were answered almost entirely in the deck.
   */
  reach: number;
  trades: number;
  traders: number;
  volume: number;
  comments: number;
  /**
   * traders / reach — how well the question converts being seen into an answer.
   * Capped at 1: the numerator is accounts and the denominator browser-days, so the
   * two can still cross on a question one account answered over several days, and a
   * rate above 100% is a unit mismatch rather than news.
   */
  conversion: number;
}

export async function getMarketMetrics(r: Range, opts: { limit?: number; status?: "open" | "all" } = {}): Promise<MarketMetrics[]> {
  const limit = opts.limit ?? 100;
  const rows = await all<MarketMetrics>(sql`
    select m.id as slug, m.title, m.category, m.status, m.resolution, m.probability,
           m.createdBy, m.createdAt, m.closesAt,
           coalesce(a.views, 0) as views,
           coalesce(a.visitors, 0) as visitors,
           coalesce(s.reach, 0) as reach,
           coalesce(t.trades, 0) as trades,
           coalesce(t.traders, 0) as traders,
           coalesce(t.volume, 0) as volume,
           coalesce(c.n, 0) as comments,
           case when coalesce(s.reach, 0) > 0 then min(1.0, cast(coalesce(t.traders, 0) as real) / s.reach) else 0 end as conversion
    from market m
    left join (
      select marketId, count(*) as views, count(distinct visitorId) as visitors
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and marketId is not null
      group by marketId
    ) a on a.marketId = m.id
    left join (
      select marketId, count(distinct visitorId) as reach
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and marketId is not null
        and (name = ${EVENTS.pageview} or name = ${EVENTS.rapidSeen})
      group by marketId
    ) s on s.marketId = m.id
    left join (
      select marketId, count(*) as trades, count(distinct userId) as traders, sum(amount) as volume
      from trade where createdAt >= ${r.from} group by marketId
    ) t on t.marketId = m.id
    left join (select marketId, count(*) as n from comment group by marketId) c on c.marketId = m.id
    ${opts.status === "open" ? sql`where m.status = 'open'` : sql``}
    -- reach and not views: a question the deck showed a hundred times and whose page
    -- nobody opened is one of the most-seen questions on the site, and ordering by
    -- page views alone kept it off the table an analyst reads
    order by (coalesce(s.reach, 0) + coalesce(a.views, 0) + coalesce(t.trades, 0) * 5) desc, m.createdAt desc
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
  /** traders / reach over the category's questions — the same capped rate `MarketMetrics.conversion` reports */
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
           case when coalesce(sum(s.reach), 0) > 0
                then min(1.0, cast(coalesce(sum(t.traders), 0) as real) / sum(s.reach)) else 0 end as avgConversion
    from market m
    left join (
      select marketId, count(*) as views, count(distinct visitorId) as visitors
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.pageview} and marketId is not null
      group by marketId
    ) a on a.marketId = m.id
    left join (
      select marketId, count(distinct visitorId) as reach
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and marketId is not null
        and (name = ${EVENTS.pageview} or name = ${EVENTS.rapidSeen})
      group by marketId
    ) s on s.marketId = m.id
    left join (
      select marketId, count(*) as trades, count(distinct userId) as traders, sum(amount) as volume
      from trade where createdAt >= ${r.from} group by marketId
    ) t on t.marketId = m.id
    group by m.category
    order by views desc
  `);
}

/* --------------------------- the deck (מצב זריז) -------------------------- */

export interface RapidCardRow {
  marketId: string;
  title: string;
  status: string;
  /** times the card became the top card of a run */
  shown: number;
  /** answers given on it inside the deck, guests included */
  answered: number;
  /** shown and not answered — the run moved on */
  skipped: number;
  /** skipped / shown */
  skipRate: number;
}

/**
 * Every question the deck put in front of someone, and what happened to it.
 *
 * The deck is the site's main surface and the one place where a question is shown
 * to a person who did not choose it, which makes "how many of the people who saw
 * this question answered it" the sharpest quality signal the board has — sharper
 * than views on the question's own page, which only people who were already
 * interested ever open. `skipped` is derived (`shown - answered`) rather than
 * counted: the browser writes a skip to `rapid_skip` for an account only, and the
 * free run — the traffic this is meant to measure — has no account to write to.
 * The last card of a run is therefore counted as a skip, which costs at most one
 * card per run and never changes the ordering.
 */
export async function getRapidCards(r: Range, limit = 25, minShown = 3): Promise<RapidCardRow[]> {
  return all<RapidCardRow>(sql`
    with seen as (
      select marketId, count(*) as shown
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.rapidSeen} and marketId is not null
      group by marketId
    ),
    answered as (
      select marketId, count(*) as n
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and marketId is not null and ${DECK_ANSWER}
      group by marketId
    )
    select s.marketId,
           coalesce(m.title, s.marketId) as title,
           coalesce(m.status, '?') as status,
           s.shown,
           min(s.shown, coalesce(a.n, 0)) as answered,
           max(0, s.shown - coalesce(a.n, 0)) as skipped,
           cast(max(0, s.shown - coalesce(a.n, 0)) as real) / s.shown as skipRate
    from seen s
    left join answered a on a.marketId = s.marketId
    left join market m on m.id = s.marketId
    where s.shown >= ${minShown}
    order by skipRate desc, s.shown desc
    limit ${limit}
  `);
}

export interface RapidRunRow {
  /** answers given in the run; the last bucket is everything at or above it */
  answers: number;
  label: string;
  runs: number;
  /** of those runs, how many were played without an account */
  guestRuns: number;
  avgShown: number;
  avgSeconds: number;
}

/** The deepest bucket: `GUEST_LIMIT` is 10, so "11+" is a run that outlived the free one. */
const RUN_BUCKETS = 11;

/**
 * How far a run gets before it ends — the histogram the free run was designed
 * around and nobody could see.
 *
 * The two numbers that shape the deck are `GUEST_SOFT_ASK` (3) and `GUEST_LIMIT`
 * (10, src/lib/rapid-guest.ts): the first ask arrives after three answers and the
 * wall after ten. Whether a run dies at two, at four or at nine is the difference
 * between an ask that is too early, one that is too late, and a deck that is simply
 * not interesting enough to reach either — and a mean over the runs cannot tell the
 * three apart. One row per number of answers, guests counted separately, because
 * only the guest half of it meets those two walls at all.
 */
export async function getRapidRuns(r: Range): Promise<RapidRunRow[]> {
  const rows = await all<{ answers: number; runs: number; guestRuns: number; avgShown: number; avgSeconds: number }>(sql`
    select min(${RUN_BUCKETS}, cast(coalesce(json_extract(props, '$.answered'), 0) as integer)) as answers,
           count(*) as runs,
           sum(case when json_extract(props, '$.guest') = 1 then 1 else 0 end) as guestRuns,
           avg(cast(coalesce(json_extract(props, '$.shown'), 0) as integer)) as avgShown,
           avg(cast(coalesce(json_extract(props, '$.seconds'), 0) as integer)) as avgSeconds
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.rapidSession}
    group by answers
    order by answers
  `);
  return rows.map((row) => ({ ...row, label: row.answers >= RUN_BUCKETS ? `${RUN_BUCKETS}+` : String(row.answers) }));
}

export interface RapidSummary {
  runs: number;
  guestRuns: number;
  /** cards shown across every run in the range */
  shown: number;
  answered: number;
  /** answers per run — the number the deck exists to raise */
  answersPerRun: number;
  /** share of the cards shown that were answered */
  answerRate: number;
  avgSeconds: number;
}

/** The deck in one line: how many runs, how deep, how long. */
export async function getRapidSummary(r: Range): Promise<RapidSummary> {
  const row = await one<{ runs: number; guestRuns: number; shown: number; answered: number; seconds: number | null }>(sql`
    select count(*) as runs,
           sum(case when json_extract(props, '$.guest') = 1 then 1 else 0 end) as guestRuns,
           coalesce(sum(cast(coalesce(json_extract(props, '$.shown'), 0) as integer)), 0) as shown,
           coalesce(sum(cast(coalesce(json_extract(props, '$.answered'), 0) as integer)), 0) as answered,
           avg(cast(coalesce(json_extract(props, '$.seconds'), 0) as integer)) as seconds
    from analytics_event
    where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.rapidSession}
  `);
  const runs = row?.runs ?? 0;
  const shown = row?.shown ?? 0;
  const answered = row?.answered ?? 0;
  return {
    runs,
    guestRuns: row?.guestRuns ?? 0,
    shown,
    answered,
    answersPerRun: runs ? answered / runs : 0,
    answerRate: shown ? answered / shown : 0,
    avgSeconds: row?.seconds ?? 0,
  };
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


/**
 * Where an account came from, in one key.
 *
 * The campaign's own name when there is one; "invite" when the account arrived
 * through someone's invite link (`referredBy`); "paid" for a click Google
 * auto-tagged with a gclid and no utm_* at all — which is a real case, and letting
 * it fall into "organic" would credit the campaign's own visitors to nobody; and
 * "organic" for everyone else. `u` is the alias every query below gives the user
 * table.
 */
const ACQUISITION_KEY = sql`coalesce(
  nullif(u.utmCampaign, ''),
  case when u.referredBy is not null then 'invite'
       when u.gclid is not null or coalesce(u.utmMedium, '') <> '' then 'paid'
       else 'organic' end
)`;

export interface SourceRetentionRow {
  /** campaign name | invite | paid | organic */
  key: string;
  users: number;
  traded: number;
  /** accounts old enough for the D1 window to have closed — the denominator of `d1` */
  eligibleD1: number;
  /** of those, came back on the day after signing up (24–48h) */
  d1: number;
  /** accounts old enough for the week to have passed — the denominator of `d7` */
  eligibleD7: number;
  /** of those, came back at any point between 24 hours and 7 days after signing up */
  d7: number;
}

/**
 * Retention split by where the account came from, which is the split that decides
 * whether a campaign is worth its money.
 *
 * `getRetention` above answers one cruder question — "did this account ever come
 * back after a day" — for everyone at once, so a cohort of six accounts from three
 * different sources reads as one number that describes none of them. Two things are
 * fixed here: the acquisition split, and the denominators. An account that signed up
 * this morning cannot have a D1, and counting it in the denominator makes every
 * recent day look like a retention collapse; `eligibleD1`/`eligibleD7` are the
 * accounts the window has actually closed on, and they are the only honest
 * denominators for the two columns beside them.
 *
 * D1 is the day after (24–48h), D7 is anywhere in the first week after that first
 * day — "חזרו ביום שאחרי" and "חזרו תוך שבוע", which is what the metric table asks
 * for. "Came back" is any event or trade the account left, the same signal
 * `getRetention` uses.
 */
export async function getRetentionBySource(days = 30, now = Date.now()): Promise<SourceRetentionRow[]> {
  const from = now - Math.max(1, days) * 86_400_000;
  const DAY = 86_400_000;
  const back = (after: number, before: number) => sql`(
    exists (select 1 from trade t where t.userId = u.id and t.createdAt > u.createdAt + ${after} and t.createdAt <= u.createdAt + ${before})
    or exists (select 1 from analytics_event e where e.userId = u.id and e.ts > u.createdAt + ${after} and e.ts <= u.createdAt + ${before})
  )`;
  return all<SourceRetentionRow>(sql`
    select ${ACQUISITION_KEY} as key,
           count(*) as users,
           sum(case when exists (select 1 from trade t where t.userId = u.id) then 1 else 0 end) as traded,
           sum(case when u.createdAt <= ${now - 2 * DAY} then 1 else 0 end) as eligibleD1,
           sum(case when u.createdAt <= ${now - 2 * DAY} and ${back(DAY, 2 * DAY)} then 1 else 0 end) as d1,
           sum(case when u.createdAt <= ${now - 7 * DAY} then 1 else 0 end) as eligibleD7,
           sum(case when u.createdAt <= ${now - 7 * DAY} and ${back(DAY, 7 * DAY)} then 1 else 0 end) as d7
    from user u
    where u.createdAt >= ${from}
    group by key
    order by users desc
  `);
}

export interface FirstTradeRow {
  /** the same acquisition key `getRetentionBySource` groups by */
  key: string;
  accounts: number;
  /** of those, how many ever answered anything */
  traded: number;
  /** median minutes from sign-up to the first answer, over the accounts that answered */
  medianMinutes: number;
  /** of those, how many answered on the same Israeli day they signed up */
  sameDay: number;
}

/**
 * How long it takes a new account to answer its first question, by source.
 *
 * The metric table asks for "הרשמה → תשובה ראשונה באותו יום" and nothing measured
 * it: the only number the site had was "five of six accounts ever traded", which is
 * true of an account that answered four minutes after signing up and of one that
 * came back a week later, and those are different products. The median and not the
 * mean, for the usual reason — one account that signed up on Sunday and answered on
 * Thursday moves a mean over six accounts by a day.
 */
export async function getTimeToFirstTrade(days = 30, now = Date.now()): Promise<FirstTradeRow[]> {
  const from = now - Math.max(1, days) * 86_400_000;
  const accounts = await all<{ key: string; accounts: number }>(sql`
    select ${ACQUISITION_KEY} as key, count(*) as accounts
    from user u where u.createdAt >= ${from}
    group by key
  `);
  // SQLite has no percentile_cont: rank each account's minutes inside its own key
  // and take the first row at or above the halfway mark, exactly as the vitals and
  // the landing page do above.
  const medians = await all<{ key: string; traded: number; medianMinutes: number | null; sameDay: number }>(sql`
    with firsts as (
      select ${ACQUISITION_KEY} as key,
             (min(t.createdAt) - u.createdAt) / 60000.0 as minutes,
             case when ${day("u.createdAt")} = ${day("min(t.createdAt)")} then 1 else 0 end as sameDay
      from user u join trade t on t.userId = u.id
      where u.createdAt >= ${from}
      group by u.id
    ),
    ranked as (
      select key, minutes, sameDay,
             row_number() over (partition by key order by minutes) as rn,
             count(*) over (partition by key) as n
      from firsts
    )
    select key,
           max(n) as traded,
           min(case when rn >= (n * 50 + 99) / 100 then minutes end) as medianMinutes,
           sum(sameDay) as sameDay
    from ranked group by key
  `);
  const byKey = new Map(medians.map((m) => [m.key, m]));
  return accounts
    .map((a) => ({
      key: a.key,
      accounts: a.accounts,
      traded: byKey.get(a.key)?.traded ?? 0,
      medianMinutes: Math.round(byKey.get(a.key)?.medianMinutes ?? 0),
      sameDay: byKey.get(a.key)?.sameDay ?? 0,
    }))
    .sort((x, y) => y.accounts - x.accounts);
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

export interface DeviceVitalRow extends VitalRow {
  /** mobile | desktop | tablet | unknown, as `requestContext` classified the UA */
  device: string;
}

/**
 * The same vitals, split by device — which for this site is the only split that
 * matters.
 *
 * Eighty-two percent of the visitors are on a phone, so a site-wide p75 is very
 * nearly the mobile p75 with just enough desktop in it to look better than what a
 * visitor actually gets, and a desktop that is fine cannot be told from a phone
 * that is not. The percentiles are computed per (metric, device) rather than
 * filtered afterwards: a p75 of a subset is not a subset of a p75.
 */
export async function getWebVitalsByDevice(r: Range, minSamples = 3): Promise<DeviceVitalRow[]> {
  return all<DeviceVitalRow>(sql`
    with v as (
      select json_extract(props, '$.metric') as metric,
             device,
             value,
             row_number() over (partition by json_extract(props, '$.metric'), device order by value) as rn,
             count(*) over (partition by json_extract(props, '$.metric'), device) as n
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.webVital} and value is not null
    )
    select metric,
           case when device = '' then 'unknown' else device end as device,
           max(n) as samples,
           min(case when rn >= (n * 50 + 99) / 100 then value end) as p50,
           min(case when rn >= (n * 75 + 99) / 100 then value end) as p75,
           min(case when rn >= (n * 95 + 99) / 100 then value end) as p95
    from v
    group by metric, device
    having samples >= ${minSamples}
    order by metric, samples desc
  `);
}

export interface RouteVitalRow {
  metric: string;
  path: string;
  device: string;
  samples: number;
  p75: number;
}

/**
 * The slowest routes, per device — where the site-wide number above comes from.
 *
 * INP is here beside LCP because the deck is an interaction and not a page: a
 * question answered on a phone with a 400ms response feels broken while every
 * loading metric on the same page is green, and `/rapid` is the one route where
 * that is the whole product.
 */
export async function getRouteVitals(r: Range, metrics: string[] = ["LCP", "INP"], opts: { limit?: number; minSamples?: number } = {}): Promise<RouteVitalRow[]> {
  const names = sql.join(metrics.map((m) => sql`${m}`), sql`, `);
  return all<RouteVitalRow>(sql`
    with v as (
      select json_extract(props, '$.metric') as metric,
             path,
             device,
             value,
             row_number() over (partition by json_extract(props, '$.metric'), path, device order by value) as rn,
             count(*) over (partition by json_extract(props, '$.metric'), path, device) as n
      from analytics_event
      where ts >= ${r.from} and ts < ${r.to} and name = ${EVENTS.webVital} and value is not null
        and json_extract(props, '$.metric') in (${names})
    )
    select metric, path,
           case when device = '' then 'unknown' else device end as device,
           max(n) as samples,
           min(case when rn >= (n * 75 + 99) / 100 then value end) as p75
    from v
    group by metric, path, device
    having samples >= ${opts.minSamples ?? 3}
    order by p75 desc
    limit ${opts.limit ?? 20}
  `);
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
  const [health, funnel, traffic, vitals, routeVitals, errors, markets, paid, pages] = await Promise.all([
    getContentHealth(),
    getFunnel(r),
    getTraffic(r),
    getWebVitals(r),
    getRouteVitals(r, ["INP"], { limit: 40 }),
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
  const view = stage("question_view");
  const intent = stage("trade_intent");
  if (view && intent && view.count >= 20 && intent.count / Math.max(1, view.count) < 0.1) {
    issues.push({
      id: "low-trade-intent",
      severity: "high",
      title: "פחות מ-10% ממי שראה שאלה ניסה לענות עליה",
      detail: `${intent.count} מתוך ${view.count} — דף שאלה והחפיסה יחד. הכרטיס עצמו, פאנל המסחר, ההסבר או הצורך בהתחברות הם החשודים המיידיים.`,
      hint: "src/components/RapidDeck.tsx, src/components/TradePanel.tsx, src/components/HowToPlay.tsx",
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
  // The deck is a tap, not a page: a card that answers 300ms after the finger left
  // it is a game that feels broken while every loading metric on the same screen is
  // green. 200ms is Google's own INP threshold, and the row that decides it is the
  // phone's — that is where the players are.
  const rapidRows = routeVitals.filter((v) => v.path === "/rapid" && v.samples >= 8);
  const rapidInp = rapidRows.find((v) => v.device === "mobile") ?? rapidRows[0];
  if (rapidInp && rapidInp.p75 > 200) {
    issues.push({
      id: "slow-inp-rapid",
      severity: "high",
      title: `החפיסה מגיבה לאט (INP p75 = ${Math.round(rapidInp.p75)}ms ב-${rapidInp.device})`,
      detail: `מעל 200ms נחשב איטי לתגובה למגע, ובמצב זריז זה כל המוצר: ${rapidInp.samples} דגימות ב-/rapid. חשודים: עבודה בזמן הרינדור של הכרטיס הבא, אנימציית המעבר, והמאזינים על הגלילה.`,
      hint: "src/components/RapidDeck.tsx, src/components/RapidSpark.tsx",
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
