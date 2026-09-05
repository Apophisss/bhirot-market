import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { AdapterAccountType } from "next-auth/adapters";

// the value itself lives in the dependency-free `limits.ts` so the browser can read
// it without importing the schema; re-exported here because everything already does
import { STARTING_BALANCE } from "../limits";
export { STARTING_BALANCE };

/* ---------- Auth.js tables (shape required by @auth/drizzle-adapter) ---------- */

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  balance: real("balance").notNull().default(STARTING_BALANCE),
  /** personal invite code, minted on first visit to /invite (see `referral-program.ts`) */
  referralCode: text("referralCode").unique(),
  /** id of the user whose invite link brought this one in. Deliberately not a foreign key: an inviter who deletes their account must not take their invitees' rows with them. */
  referredBy: text("referredBy"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  /* --- ad attribution: stamped once, from the first visit that carried campaign params --- */
  /** Google click id, so a signup can later be tied back to the click that paid for it. */
  gclid: text("gclid"),
  utmSource: text("utmSource"),
  utmMedium: text("utmMedium"),
  utmCampaign: text("utmCampaign"),
  /** Google substitutes `{adgroupid}` into `utm_content`, so this is the column that answers "which creative earned this user". */
  utmContent: text("utmContent"),
  /** Set the moment the sign_up conversion is handed to gtag, so it is reported exactly once. */
  signupReportedAt: integer("signupReportedAt", { mode: "timestamp_ms" }),
  /** Same, for the first trade — the conversion the campaign actually bids on. */
  firstTradeReportedAt: integer("firstTradeReportedAt", { mode: "timestamp_ms" }),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

/* ---------- Prediction-market tables ---------- */

export type MarketStatus = "open" | "resolved" | "cancelled";
export type Resolution = "YES" | "NO";
export type Side = "YES" | "NO";
export type TradeAction = "BUY" | "SELL";

export const markets = sqliteTable(
  "market",
  {
    /** slug, also used in URLs */
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description").notNull().default(""),
    resolutionCriteria: text("resolutionCriteria").notNull().default(""),
    category: text("category").notNull().default("general"),
    /** JSON string[] */
    tags: text("tags").notNull().default("[]"),
    imageUrl: text("imageUrl"),
    /** JSON string[] of people ids (see data/people.json) */
    people: text("people").notNull().default("[]"),
    /** JSON {title,url}[] */
    sources: text("sources").notNull().default("[]"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    /** 1..5, how good a question the creator thinks it is (see src/lib/appeal.ts). 3 = unrated. */
    appeal: integer("appeal").notNull().default(3),
    /** 1..5, how tied to the news of the day it was (see src/lib/topicality.ts). Decays from `createdAt`; 1 = evergreen. */
    topicality: integer("topicality").notNull().default(1),
    status: text("status").$type<MarketStatus>().notNull().default("open"),
    resolution: text("resolution").$type<Resolution>(),
    resolutionNote: text("resolutionNote"),
    resolvedAt: integer("resolvedAt", { mode: "timestamp_ms" }),
    closesAt: integer("closesAt", { mode: "timestamp_ms" }).notNull(),
    /** LMSR liquidity parameter b */
    liquidity: real("liquidity").notNull().default(2000),
    qYes: real("qYes").notNull().default(0),
    qNo: real("qNo").notNull().default(0),
    /** current YES probability, cached for sorting/listing */
    probability: real("probability").notNull().default(0.5),
    volume: real("volume").notNull().default(0),
    tradeCount: integer("tradeCount").notNull().default(0),
    /** who created it: seed | routine | cron | admin */
    createdBy: text("createdBy").notNull().default("seed"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (m) => [
    index("market_status_idx").on(m.status),
    index("market_category_idx").on(m.category),
  ],
);

export const positions = sqliteTable(
  "position",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    marketId: text("marketId")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    yesShares: real("yesShares").notNull().default(0),
    noShares: real("noShares").notNull().default(0),
    /** cumulative net cost basis of the currently held shares */
    yesCost: real("yesCost").notNull().default(0),
    noCost: real("noCost").notNull().default(0),
    realizedPnl: real("realizedPnl").notNull().default(0),
    settled: integer("settled", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (p) => [
    uniqueIndex("position_user_market_idx").on(p.userId, p.marketId),
    index("position_market_idx").on(p.marketId),
  ],
);

export const trades = sqliteTable(
  "trade",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    marketId: text("marketId")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    side: text("side").$type<Side>().notNull(),
    action: text("action").$type<TradeAction>().notNull(),
    shares: real("shares").notNull(),
    amount: real("amount").notNull(),
    priceBefore: real("priceBefore").notNull(),
    priceAfter: real("priceAfter").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("trade_market_idx").on(t.marketId, t.createdAt),
    index("trade_user_idx").on(t.userId, t.createdAt),
  ],
);

export const priceHistory = sqliteTable(
  "price_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    marketId: text("marketId")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    probability: real("probability").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
  },
  (p) => [index("price_history_market_idx").on(p.marketId, p.ts)],
);

export const comments = sqliteTable(
  "comment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    marketId: text("marketId")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (c) => [index("comment_market_idx").on(c.marketId, c.createdAt)],
);

/**
 * One row per accepted invite: who invited whom, and what the inviter was paid for it.
 * The row is the ledger — `referral.bonus` is what separates gifted capital from
 * trading profit everywhere a P&L is shown.
 */
export const referrals = sqliteTable(
  "referral",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referrerId: text("referrerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** the invited user — unique, so an account can only ever be credited once */
    invitedId: text("invitedId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** ₪ paid to the inviter for this signup; 0 once they pass MAX_REFERRALS */
    bonus: real("bonus").notNull().default(0),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (r) => [
    uniqueIndex("referral_invited_idx").on(r.invitedId),
    index("referral_referrer_idx").on(r.referrerId, r.createdAt),
  ],
);

/* ---------- Onboarding survey / personalization ---------- */

export type SurveyStatus = "completed" | "skipped";
/** How far out a user likes their questions to close. */
export type Horizon = "fast" | "mixed" | "long";

/**
 * What the short political survey learned about a user, and the fact that they
 * were already asked. One row per user: its existence (whatever its `status`) is
 * what stops the site from asking again.
 */
export const userPreferences = sqliteTable("user_preference", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** JSON string[] of category ids (see src/lib/categories.ts) */
  topics: text("topics").notNull().default("[]"),
  /** JSON string[] of people ids (see data/people.json) */
  people: text("people").notNull().default("[]"),
  horizon: text("horizon").$type<Horizon>().notNull().default("mixed"),
  status: text("status").$type<SurveyStatus>().notNull().default("completed"),
  /** which revision of the survey they answered, so a future one can re-ask */
  version: integer("version").notNull().default(1),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * מה שהמשתמש בחר בממשק — הבחירות שאינן שייכות למכשיר שבו נבחרו.
 *
 * טבלה נפרדת מ-`user_preference` בכוונה, ולא עוד עמודות בה: שם, עצם קיומה של
 * השורה הוא מה שאומר "כבר שאלנו את המשתמש הזה את השאלון" (`needsSurvey`), ולכן
 * שמירת הסכום שנבחר בסליידר הייתה מוחקת בשקט את השאלון מכל מי שנגע בו. שם
 * *תשובות* לשאלון, כאן *הגדרות תצוגה*.
 *
 * כל עמודה יכולה להיות NULL, וזה מה שמבדיל בין "בחר" ל"עוד לא בחר": ברירות
 * המחדל חיות ב-`src/lib/settings.ts` ולא ב-SQL (כך המספר מוגדר פעם אחת, גם
 * לדפדפן), ואימוץ ההעדפות של אורח בהתחברות ממלא רק את מה שעוד לא נבחר.
 */
export const userSettings = sqliteTable("user_setting", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** הסכום לכל תשובה במצב זריז, בנקודות (טווח: src/lib/rapid.ts) */
  rapidStake: integer("rapidStake"),
  /** מיון החפיסה האחרון שנבחר (RapidSort) */
  rapidSort: text("rapidSort"),
  /** "כולל שאלות שכבר עניתי" */
  rapidIncludeAnswered: integer("rapidIncludeAnswered", { mode: "boolean" }),
  /** עד מתי "לא עכשיו" משתיק את ההצעה למלא את השאלון — בחשבון, לא בדפדפן */
  surveySnoozedUntil: integer("surveySnoozedUntil", { mode: "timestamp_ms" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/* ---------- Inbox: what users send the editorial team ---------- */

/** Where a message or a suggestion stands in the editorial team's queue. */
export type InboxStatus = "new" | "open" | "done";
export type SuggestionStatus = "pending" | "approved" | "rejected";

/** "Contact us" messages. A message may come from a signed-out visitor, hence the nullable userId. */
export const contactMessages = sqliteTable(
  "contact_message",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("userId").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull().default(""),
    email: text("email").notNull().default(""),
    /** question | bug | market | idea | other */
    topic: text("topic").notNull().default("other"),
    /** free-text title the sender wrote, so the inbox is scannable without opening every message */
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    status: text("status").$type<InboxStatus>().notNull().default("new"),
    /** private note written on the admin dashboard */
    adminNote: text("adminNote"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    handledAt: integer("handledAt", { mode: "timestamp_ms" }),
  },
  (c) => [index("contact_status_idx").on(c.status, c.createdAt)],
);

/**
 * A question proposed by a user. It never becomes a market on its own: the editorial
 * team opens it in the dashboard's "new question" form, prices it, and publishes.
 */
export const questionSuggestions = sqliteTable(
  "question_suggestion",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("userId").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull().default(""),
    email: text("email").notNull().default(""),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    resolutionCriteria: text("resolutionCriteria").notNull().default(""),
    category: text("category").notNull().default("general"),
    /** image the suggester picked for the card (absolute URL or /public path) */
    imageUrl: text("imageUrl"),
    /** the suggester's own estimate for YES, 0..1 */
    probability: real("probability"),
    sourceUrl: text("sourceUrl"),
    closesAt: integer("closesAt", { mode: "timestamp_ms" }),
    status: text("status").$type<SuggestionStatus>().notNull().default("pending"),
    adminNote: text("adminNote"),
    /** slug of the market this suggestion became, once published */
    publishedSlug: text("publishedSlug"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    reviewedAt: integer("reviewedAt", { mode: "timestamp_ms" }),
  },
  (s) => [index("suggestion_status_idx").on(s.status, s.createdAt)],
);

/** Log of editorial content updates (hourly routine / cron / admin API). */
export const agentRuns = sqliteTable("agent_run", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  summary: text("summary").notNull().default(""),
  added: integer("added").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  resolved: integer("resolved").notNull().default(0),
  ok: integer("ok", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * First-party analytics log — one row per event (pageview, click, trade, web vital, error).
 * Cookie-less: `visitorId` is a daily-rotating hash of ip+user-agent, so it identifies a
 * browser for a day and never a person. No IP, no user-agent and no PII are stored.
 */
export const analyticsEvents = sqliteTable(
  "analytics_event",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** pageview | page_exit | click | search | trade | signup | web_vital | client_error | … */
    name: text("name").notNull(),
    /** URL path without the query string */
    path: text("path").notNull().default(""),
    /** query string without the leading "?" (kept for utm + filter analysis) */
    query: text("query").notNull().default(""),
    /** referrer host; "" = direct, "internal" = another page of the site */
    referrer: text("referrer").notNull().default(""),
    /** utm_source, or the referrer host when there is no utm */
    source: text("source").notNull().default(""),
    medium: text("medium").notNull().default(""),
    campaign: text("campaign").notNull().default(""),
    /** daily-rotating hash of ip+ua — a browser-day, not a person */
    visitorId: text("visitorId").notNull().default(""),
    /** one browser tab visit (sessionStorage) */
    sessionId: text("sessionId").notNull().default(""),
    /** set when the visitor was signed in (no FK: the log outlives the account) */
    userId: text("userId"),
    /** market slug, when the event happened on/about a market */
    marketId: text("marketId"),
    device: text("device").notNull().default(""),
    country: text("country").notNull().default(""),
    /** numeric payload: ms for timings, ₪ for trades, score for web vitals */
    value: real("value"),
    /** JSON object with event-specific fields */
    props: text("props").notNull().default("{}"),
    ts: integer("ts", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (e) => [
    index("analytics_ts_idx").on(e.ts),
    index("analytics_name_ts_idx").on(e.name, e.ts),
    index("analytics_path_ts_idx").on(e.path, e.ts),
    index("analytics_visitor_ts_idx").on(e.visitorId, e.ts),
    index("analytics_market_ts_idx").on(e.marketId, e.ts),
    index("analytics_user_ts_idx").on(e.userId, e.ts),
    index("analytics_session_ts_idx").on(e.sessionId, e.ts),
  ],
);

export const nowMs = sql`(unixepoch() * 1000)`;
