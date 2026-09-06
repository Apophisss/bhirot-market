import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { initialState } from "./lmsr";
import { loadMarketsContent, type MarketContent } from "./content";
import { CONTENT_SETTLEMENT_SOURCE, settlementRefusal } from "./resolution";
import { settleMarket } from "./trade";

const { markets, priceHistory, agentRuns } = schema;

export interface SyncResult {
  added: string[];
  updated: string[];
  resolved: string[];
  skipped: string[];
  /** markets that arrived already resolved from a path with no human approval behind it */
  refused: string[];
}

/**
 * Upserts a list of markets (validated MarketContent) into the DB.
 * - new slug  -> create market with LMSR state matching initialProbability
 * - existing  -> update editorial fields (never touches prices / positions)
 * - status change to resolved/cancelled -> settle positions, but only from an
 *   approved path (see `settlementSource` below and `maySettle` in ./resolution)
 *
 * Adding and editing a question are reversible and stay open to every caller;
 * settling is not, so it is the one operation here that asks who is calling.
 */
export async function upsertMarkets(
  items: MarketContent[],
  source = "sync",
  /**
   * Who is vouching for the resolutions in `items`, when that is not the same as
   * who is writing them. Only `syncFromContent` passes it: the markets it hands
   * over come from data/markets.json, where a resolution can only have been
   * written by `applyResolution()` after a named human approved it, whatever the
   * caller chose to call itself.
   */
  opts: { settlementSource?: string } = {},
): Promise<SyncResult> {
  const db = await getDb();
  const result: SyncResult = { added: [], updated: [], resolved: [], skipped: [], refused: [] };
  const now = new Date();
  // one decision for the whole batch — it is a property of the caller, not of a row
  const refusal = settlementRefusal(opts.settlementSource ?? source);

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

    // Both branches settle, and both are irreversible: settleMarket credits balances
    // and there is no screen on the site that takes them back. The editorial fields
    // above were written either way — a refused resolution still gets its wording and
    // its deadline synced, and the market simply stays open until the pipeline
    // publishes it properly.
    const verdict = m.status === "resolved" && m.resolution ? m.resolution : m.status === "cancelled" ? "CANCELLED" : null;
    if (verdict) {
      const cur = existing ?? (await db.query.markets.findFirst({ where: eq(markets.id, m.slug) }));
      if (cur && cur.status === "open") {
        if (refusal) {
          console.warn(`[sync] ${m.slug}: ${refusal}`);
          result.refused.push(m.slug);
        } else {
          await settleMarket(m.slug, verdict, m.resolutionNote, m.resolvedAt ? new Date(m.resolvedAt) : now);
          result.resolved.push(m.slug);
        }
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
  // The file is the far end of the approval pipeline, not a caller of it: `npm run
  // resolve -- apply` is the only thing that writes a resolution into it, and it
  // refuses without a named human's approval of that exact verdict and evidence.
  const r = await upsertMarkets(file.markets, source, { settlementSource: CONTENT_SETTLEMENT_SOURCE });
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
      return { added: [], updated: [], resolved: [], skipped: [], refused: [] };
    });
  }
  return globalThis.__bhirotSynced;
}
