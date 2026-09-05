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

export const STARTING_BALANCE = 10_000;

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
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
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

export const nowMs = sql`(unixepoch() * 1000)`;
