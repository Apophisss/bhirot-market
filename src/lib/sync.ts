import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { initialState } from "./lmsr";
import { loadMarketsContent, type MarketContent } from "./content";
import { settleMarket } from "./trade";

const { markets, priceHistory, agentRuns } = schema;

export interface SyncResult {
  added: string[];
  updated: string[];
  resolved: string[];
  skipped: string[];
}

/**
 * Upserts a list of markets (validated MarketContent) into the DB.
 * - new slug  -> create market with LMSR state matching initialProbability
 * - existing  -> update editorial fields (never touches prices / positions)
 * - status change to resolved/cancelled -> settle positions
 */
export async function upsertMarkets(items: MarketContent[], source = "sync"): Promise<SyncResult> {
  const db = await getDb();
  const result: SyncResult = { added: [], updated: [], resolved: [], skipped: [] };
  const now = new Date();

  for (const m of items) {
    const existing = await db.query.markets.findFirst({ where: eq(markets.id, m.slug) });
    const common = {
      title: m.title,
      subtitle: m.subtitle ?? null,
      description: m.description,
      resolutionCriteria: m.resolutionCriteria,
      category: m.category,
      tags: JSON.stringify(m.tags),
      imageUrl: m.imageUrl ?? null,
      people: JSON.stringify(m.people),
      sources: JSON.stringify(m.sources),
      featured: m.featured,
      // unlike `liquidity`, the creator's ratings are pure editorial judgement: nobody
      // traded on them, so a later re-rating is allowed to land on a live market. It buys
      // less than it looks like for `topicality`, which decays from the unchanged
      // `createdAt` — a correction, not a second launch (see ./topicality).
      appeal: m.appeal,
      topicality: m.topicality,
      closesAt: new Date(m.closesAt),
    };

    if (!existing) {
      const state = initialState(m.initialProbability, m.liquidity);
      const createdAt = new Date(m.createdAt);
      await db.insert(markets).values({
        id: m.slug,
        ...common,
        liquidity: m.liquidity,
        qYes: state.qYes,
        qNo: state.qNo,
        probability: m.initialProbability,
        createdBy: m.createdBy || source,
        createdAt,
        updatedAt: now,
      });
      await db.insert(priceHistory).values({ marketId: m.slug, probability: m.initialProbability, ts: createdAt });
      result.added.push(m.slug);
    } else {
      const changed =
        existing.title !== common.title ||
        existing.subtitle !== common.subtitle ||
        existing.description !== common.description ||
        existing.resolutionCriteria !== common.resolutionCriteria ||
        existing.category !== common.category ||
        existing.tags !== common.tags ||
        existing.imageUrl !== common.imageUrl ||
        existing.people !== common.people ||
        existing.sources !== common.sources ||
        existing.featured !== common.featured ||
        existing.appeal !== common.appeal ||
        existing.topicality !== common.topicality ||
        existing.closesAt.getTime() !== common.closesAt.getTime();
      if (changed) {
        await db.update(markets).set({ ...common, updatedAt: now }).where(eq(markets.id, m.slug));
        result.updated.push(m.slug);
      } else {
        result.skipped.push(m.slug);
      }
    }

    if (m.status === "resolved" && m.resolution) {
      const cur = existing ?? (await db.query.markets.findFirst({ where: eq(markets.id, m.slug) }));
      if (cur && cur.status === "open") {
        await settleMarket(m.slug, m.resolution, m.resolutionNote, m.resolvedAt ? new Date(m.resolvedAt) : now);
        result.resolved.push(m.slug);
      }
    } else if (m.status === "cancelled") {
      const cur = existing ?? (await db.query.markets.findFirst({ where: eq(markets.id, m.slug) }));
      if (cur && cur.status === "open") {
        await settleMarket(m.slug, "CANCELLED", m.resolutionNote, m.resolvedAt ? new Date(m.resolvedAt) : now);
        result.resolved.push(m.slug);
      }
    }
  }
  return result;
}

export async function logAgentRun(source: string, summary: string, r: Partial<SyncResult> & { ok?: boolean }) {
  const db = await getDb();
  await db.insert(agentRuns).values({
    source,
    summary,
    added: r.added?.length ?? 0,
    updated: r.updated?.length ?? 0,
    resolved: r.resolved?.length ?? 0,
    ok: r.ok ?? true,
  });
}

/** Sync the bundled data/markets.json into the database. */
export async function syncFromContent(source = "content"): Promise<SyncResult> {
  const file = loadMarketsContent();
  const r = await upsertMarkets(file.markets, source);
  if (r.added.length || r.resolved.length) {
    await logAgentRun(source, file.lastUpdateNote ?? "סנכרון מקובץ data/markets.json", r);
  }
  return r;
}

declare global {
  var __bhirotSynced: Promise<SyncResult> | undefined;
}

/** Runs the content sync once per server instance (cheap no-op afterwards). */
export function ensureSynced(): Promise<SyncResult> {
  if (!globalThis.__bhirotSynced) {
    globalThis.__bhirotSynced = syncFromContent("startup").catch((err) => {
      console.error("[sync] failed", err);
      globalThis.__bhirotSynced = undefined;
      return { added: [], updated: [], resolved: [], skipped: [] };
    });
  }
  return globalThis.__bhirotSynced;
}
