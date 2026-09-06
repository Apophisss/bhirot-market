/**
 * End-to-end tests for the board cache (`src/lib/board-cache.ts`) and the card
 * projection it reads through (`listMarkets({ columns: "card" })`), against a
 * throwaway SQLite file.
 *
 * Two things have to hold, and neither is provable by reading the cache alone:
 *
 *   1. nothing personal is ever shared. The pool and the counters are one object handed
 *      to everybody, so the test signs two accounts in, gives them different histories,
 *      and checks that neither one's recommendations follow the other.
 *   2. the card projection is invisible. A card view has to equal the full view field
 *      for field except the two texts it deliberately did not read — and no surface
 *      that draws a card may read either of them, which is checked against the sources.
 *
 * Run: npm run test:board   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// the db module reads DATABASE_URL lazily, on the first getDb() — setting it here
// (before main runs) is enough to keep the tests off the real database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-board-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;
process.env.BOARD_CACHE_TTL_SECONDS = "1";

import { getDb, schema } from "../src/lib/db";
import { initialState } from "../src/lib/lmsr";
import { listMarkets, type MarketView } from "../src/lib/markets";
import {
  boardCacheSize,
  getBoardRecommendations,
  getCategoryBoard,
  getHomeBoard,
  invalidateBoardCache,
  isFilteredBoard,
} from "../src/lib/board-cache";

const { users, markets, positions } = schema;

const DAY = 86_400_000;

let db: Awaited<ReturnType<typeof getDb>>;
let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}`);
    console.error(`      ${(err as Error).message.split("\n")[0]}`);
  }
}

let seq = 0;
async function makeMarket(opts: { category?: string; person?: string; volume?: number } = {}) {
  const id = `m${++seq}`;
  const state = initialState(0.5, 2000);
  await db.insert(markets).values({
    id,
    title: `שאלה ${id}`,
    description: "ד".repeat(4000),
    resolutionCriteria: "מקור פומבי כלשהו",
    category: opts.category ?? "general",
    people: JSON.stringify(opts.person ? [opts.person] : []),
    tags: JSON.stringify(["בדיקה"]),
    sources: JSON.stringify([]),
    liquidity: 2000,
    qYes: state.qYes,
    qNo: state.qNo,
    probability: 0.5,
    volume: opts.volume ?? 0,
    closesAt: new Date(Date.now() + 30 * DAY),
    createdAt: new Date(Date.now() - DAY),
    updatedAt: new Date(),
  });
  return id;
}

/** The files that draw a card, and therefore must never read a column the card query skips. */
const CARD_SOURCES = [
  "src/components/MarketCard.tsx",
  "src/components/MarketBrowser.tsx",
  "src/components/Recommendations.tsx",
  "src/components/PeopleStack.tsx",
  "src/app/(listing)/page.tsx",
  "src/app/category/[id]/page.tsx",
];

async function main() {
  db = await getDb();

  await test("a card view equals the full view apart from the two texts it did not read", async () => {
    await makeMarket({ category: "polls", person: "benjamin-netanyahu", volume: 120 });
    await makeMarket({ category: "legal", volume: 40 });
    const full = await listMarkets({ status: "open", sort: "trending", limit: 50 });
    const card = await listMarkets({ status: "open", sort: "trending", limit: 50, columns: "card" });
    assert.equal(card.length, full.length, "the card projection returned a different number of rows");
    for (let i = 0; i < full.length; i++) {
      assert.equal(card[i].id, full[i].id, "the card projection returned a different order");
      assert.equal(card[i].description, "", "the card projection read the description after all");
      assert.equal(card[i].resolutionCriteria, "", "the card projection read the resolution criteria after all");
      // the display counters and `isTradable` are functions of the clock the view was
      // built against, and the two reads happened milliseconds apart — everything else
      // is the row itself and has to match exactly
      const strip = (m: MarketView) => {
        const rest: Partial<MarketView> = { ...m };
        for (const k of ["description", "resolutionCriteria", "displayTradeCount", "displayVolume", "isTradable"] as const) {
          delete rest[k];
        }
        return JSON.stringify(rest);
      };
      assert.equal(strip(card[i]), strip(full[i]), `card and full disagree on ${full[i].id}`);
    }
  });

  await test("nothing that draws a card reads a column the card query skips", () => {
    for (const file of CARD_SOURCES) {
      const src = fs.readFileSync(file, "utf8");
      for (const field of ["description", "resolutionCriteria"]) {
        const hit = new RegExp(`\\bm(arket)?\\.${field}\\b|\\.market\\.${field}\\b`).exec(src);
        assert.equal(hit, null, `${file} reads ${field} off a market, but a listing no longer loads it`);
      }
    }
  });

  await test("a second read inside the window does not touch the database", async () => {
    invalidateBoardCache();
    const query = { category: "all", sort: "trending", status: "open" } as const;
    const first = await getHomeBoard(query);
    // the proof is identity, not equality: a cache hit returns the very same array
    const second = await getHomeBoard(query);
    assert.equal(second.markets, first.markets, "the second read rebuilt the listing");
    assert.equal(second.counts, first.counts, "the second read rebuilt the counters");
    assert.ok(boardCacheSize() > 0, "nothing was cached at all");
  });

  await test("eight simultaneous renders share one read", async () => {
    invalidateBoardCache();
    const query = { category: "all", sort: "trending", status: "open" } as const;
    const boards = await Promise.all(Array.from({ length: 8 }, () => getHomeBoard(query)));
    for (const b of boards) assert.equal(b.markets, boards[0].markets, "a concurrent render read the board again");
  });

  await test("the entry expires, and a new one is read", async () => {
    invalidateBoardCache();
    const query = { category: "all", sort: "trending", status: "open" } as const;
    const first = await getHomeBoard(query);
    await new Promise((r) => setTimeout(r, 1100)); // BOARD_CACHE_TTL_SECONDS = 1
    const second = await getHomeBoard(query);
    assert.notEqual(second.markets, first.markets, "a stale entry was served past its window");
  });

  await test("a different query shape is a different entry", async () => {
    invalidateBoardCache();
    const open = await getHomeBoard({ category: "all", sort: "trending", status: "open" });
    const resolved = await getHomeBoard({ category: "all", sort: "trending", status: "resolved" });
    const searched = await getHomeBoard({ category: "all", sort: "trending", status: "open", q: "אין־כזה־דבר" });
    assert.notEqual(resolved.markets, open.markets, "two statuses shared one entry");
    assert.notEqual(searched.markets, open.markets, "a search shared the unfiltered entry");
    assert.equal(searched.markets.length, 0, "the search matched something it should not have");
  });

  await test("a category board shares the counters with the home board", async () => {
    invalidateBoardCache();
    const home = await getHomeBoard({ category: "all", sort: "trending", status: "open" });
    const cat = await getCategoryBoard({ category: "polls", sort: "trending", status: "open" });
    assert.equal(cat.counts, home.counts, "the category page read the counters a second time");
    assert.ok(
      cat.markets.every((m) => m.category === "polls"),
      "the category board leaked another category's questions",
    );
  });

  await test("a filtered board is recognised as one", () => {
    assert.equal(isFilteredBoard({ status: "open" }), false);
    assert.equal(isFilteredBoard({ status: "resolved" }), true);
    assert.equal(isFilteredBoard({ status: "open", q: "נתניהו" }), true);
    assert.equal(isFilteredBoard({ status: "open", person: "benjamin-netanyahu" }), true);
  });

  await test("two accounts share the pool and never share a recommendation", async () => {
    invalidateBoardCache();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await makeMarket({ category: "polls", volume: 100 - i }));
    await db.insert(users).values([
      { id: "u-a", name: "א", email: "a@example.com", balance: 1000 },
      { id: "u-b", name: "ב", email: "b@example.com", balance: 1000 },
    ]);
    // each account has already answered a different half of the board
    const answered = { "u-a": ids.slice(0, 3), "u-b": ids.slice(3) };
    for (const [userId, list] of Object.entries(answered)) {
      for (const marketId of list) {
        await db.insert(positions).values({ userId, marketId, yesShares: 10, yesCost: 10, updatedAt: new Date() });
      }
    }

    const [guest, a, b] = await Promise.all([
      getBoardRecommendations({ limit: 20 }),
      getBoardRecommendations({ userId: "u-a", limit: 20 }),
      getBoardRecommendations({ userId: "u-b", limit: 20 }),
    ]);
    const seen = (r: Awaited<ReturnType<typeof getBoardRecommendations>>) => r.items.map((i) => i.market.id);
    for (const id of answered["u-a"]) {
      assert.ok(!seen(a).includes(id), `u-a was recommended ${id}, which they have already answered`);
      assert.ok(seen(b).includes(id), `u-b lost ${id}, which only u-a had answered`);
    }
    for (const id of answered["u-b"]) {
      assert.ok(!seen(b).includes(id), `u-b was recommended ${id}, which they have already answered`);
      assert.ok(seen(a).includes(id), `u-a lost ${id}, which only u-b had answered`);
    }
    assert.ok(seen(guest).length >= 6, "the guest board lost questions nobody had answered");
  });

  await test("a guest result is cached, and a signed-in one never is", async () => {
    invalidateBoardCache();
    const [g1, g2] = [await getBoardRecommendations({ limit: 4 }), await getBoardRecommendations({ limit: 4 })];
    assert.equal(g2, await getBoardRecommendations({ limit: 4 }), "the guest row was rebuilt");
    assert.equal(g1.items[0]?.market.id, g2.items[0]?.market.id);
    const u1 = await getBoardRecommendations({ userId: "u-a", limit: 4 });
    const u2 = await getBoardRecommendations({ userId: "u-a", limit: 4 });
    assert.notEqual(u1, u2, "a personal result was stored in a cache everybody reads");
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (failures.length) {
    console.error(`\nboard-cache: ${passed} passed, ${failures.length} FAILED\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    process.exit(1);
  }
  console.log(`board-cache: ${passed} end-to-end tests passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
