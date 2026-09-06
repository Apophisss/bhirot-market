/**
 * Tests for the paid-traffic funnel (src/lib/stats.ts → getPaidFunnel,
 * getPaidCampaigns, getPaidLanguages).
 *
 * The campaign pays for every session this funnel counts, and the report it feeds
 * is what decides whether the landing page, the deck or the sign-in screen gets
 * fixed next — so the SQL is exercised against a real SQLite file with a handful
 * of hand-built sessions rather than against a mock:
 *
 *   A  an ad click that went all the way: /welcome → answered → /rapid → the wall → /login
 *   B  an ad click that bounced (one pageview, nothing else)
 *   C  an organic visit that did everything A did — must not be counted
 *   D  an ad click that tapped a marked element and left
 *   E  an ad click from a second campaign, with a second pageview
 *
 * plus three accounts: two stamped with the campaign (one traded), one organic —
 * and, later, one stamped with a bare gclid and no campaign at all.
 *
 * Every paid session is preceded by a server-side `landing` (no session id), plus
 * one more than there are sessions: the click that left before the JavaScript ran.
 *
 * Run: npm run test:paid   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-paid-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { getDb, schema } from "../src/lib/db";
import { EVENTS } from "../src/lib/events";
import { getIssues, getPaidCampaigns, getPaidFunnel, getPaidLanguages, range } from "../src/lib/stats";

const { analyticsEvents, users, markets, trades } = schema;

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}: ${(err as Error).message.split("\n")[0]}`);
  }
}

const NOW = Date.now();
const PAID = { source: "google", medium: "demandgen", campaign: "quiz" };
const PAID2 = { source: "google", medium: "demandgen", campaign: "generic" };

type Ev = {
  name: string;
  session: string;
  visitor?: string;
  path?: string;
  utm?: { source: string; medium: string; campaign: string } | null;
  props?: Record<string, unknown>;
  at?: number;
};

async function main() {
  const db = await getDb();

  let t = NOW - 60 * 60 * 1000; // an hour ago, ticking forward per event
  const ev = (e: Ev) => ({
    name: e.name,
    path: e.path ?? "/welcome",
    query: "",
    referrer: "",
    source: e.utm?.source ?? "",
    medium: e.utm?.medium ?? "",
    campaign: e.utm?.campaign ?? "",
    visitorId: e.visitor ?? `v-${e.session}`,
    sessionId: e.session,
    userId: null,
    marketId: null,
    device: "mobile",
    country: "",
    value: null,
    props: JSON.stringify(e.props ?? {}),
    ts: new Date(e.at ?? (t += 1000)),
  });

  await db.insert(analyticsEvents).values([
    // the server saw five ad clicks arrive; the browser will report four sessions
    ...["A", "B", "D", "E", "lost"].map((k) => ev({ name: EVENTS.landing, session: "", visitor: `v-${k}`, utm: PAID })),
    // A — the whole path
    ev({ name: EVENTS.pageview, session: "A", utm: PAID, props: { lang: "he" } }),
    ev({ name: EVENTS.guestAnswer, session: "A", props: { surface: "welcome", side: "YES", stored: 1 } }),
    ev({ name: EVENTS.pageview, session: "A", path: "/rapid" }),
    ev({ name: EVENTS.guestAnswer, session: "A", path: "/rapid", props: { surface: "deck", side: "NO", stored: 2 } }),
    ev({ name: EVENTS.guestGate, session: "A", path: "/rapid", props: { n: 10, soon: 1 } }),
    ev({ name: EVENTS.pageview, session: "A", path: "/login" }),
    // B — bounced
    ev({ name: EVENTS.pageview, session: "B", utm: PAID, props: { lang: "en" } }),
    ev({ name: EVENTS.pageExit, session: "B" }),
    // C — organic, did everything: must not count anywhere in the paid funnel
    ev({ name: EVENTS.pageview, session: "C", path: "/", utm: null }),
    ev({ name: EVENTS.pageview, session: "C", path: "/rapid" }),
    ev({ name: EVENTS.guestAnswer, session: "C", path: "/rapid", props: { surface: "deck", side: "YES", stored: 1 } }),
    ev({ name: EVENTS.pageview, session: "C", path: "/login" }),
    // D — tapped the CTA and left (the click is the only trace)
    ev({ name: EVENTS.pageview, session: "D", utm: PAID, props: { lang: "he" } }),
    ev({ name: EVENTS.click, session: "D", props: { id: "welcome-start" } }),
    // E — second campaign, opened a second page
    ev({ name: EVENTS.pageview, session: "E", utm: PAID2, props: { lang: "ru" } }),
    ev({ name: EVENTS.pageview, session: "E", path: "/about" }),
    // an old paid pageview outside the range: invisible
    ev({ name: EVENTS.pageview, session: "OLD", utm: PAID, at: NOW - 40 * 86_400_000 }),
  ]);

  await db.insert(markets).values({ id: "m1", title: "t", closesAt: new Date(NOW + 86_400_000) });
  const [u1] = await db.insert(users).values({ email: "u1@t.local", name: "u1", utmSource: "google", utmMedium: "demandgen", utmCampaign: "quiz" }).returning();
  await db.insert(users).values({ email: "u2@t.local", name: "u2", utmSource: "google", utmMedium: "demandgen", utmCampaign: "quiz" });
  const [u3] = await db.insert(users).values({ email: "u3@t.local", name: "u3" }).returning();
  const trade = (userId: string) => ({ userId, marketId: "m1", side: "YES" as const, action: "BUY" as const, shares: 1, amount: 1, priceBefore: 0.5, priceAfter: 0.5 });
  await db.insert(trades).values([trade(u1.id), trade(u3.id)]);

  const r = range(30, NOW + 1000);

  await test("the funnel counts paid sessions and nothing else", async () => {
    const f = await getPaidFunnel(r);
    const by = Object.fromEntries(f.stages.map((s) => [s.id, s.count]));
    assert.deepEqual(by, {
      paid_sessions: 4, // A B D E
      paid_touched: 2, // A (answered), D (click)
      paid_deck: 1, // A
      paid_answered: 1, // A
      paid_gate: 1, // A
      paid_login: 1, // A — C's /login is organic
      paid_signup: 2, // u1, u2
      paid_trade: 1, // u1
    });
    assert.equal(f.visitors, 4);
    assert.equal(f.landings, 5, "server-side landings, sessions or not");
  });

  await test("every rate is relative to the stage before it — except across the unit break", async () => {
    const f = await getPaidFunnel(r);
    assert.equal(f.stages[0].rate, 1);
    assert.equal(f.stages[1].rate, 2 / 4);
    assert.equal(f.stages[2].rate, 1 / 2);
    assert.equal(f.stages[5].id, "paid_login");
    assert.equal(f.stages[5].rate, 1);
    // sessions on one side, accounts on the other: "200%" is not a conversion
    assert.equal(f.stages[6].id, "paid_signup");
    assert.equal(f.stages[6].rate, null);
    assert.equal(f.stages[7].rate, 1 / 2);
  });

  await test("a campaign gets a row with its own path and its own accounts", async () => {
    const rows = await getPaidCampaigns(r);
    const quiz = rows.find((x) => x.key === "google / demandgen / quiz");
    const generic = rows.find((x) => x.key === "google / demandgen / generic");
    assert.ok(quiz, "quiz row");
    assert.ok(generic, "generic row");
    assert.deepEqual(
      { sessions: quiz!.sessions, engaged: quiz!.engaged, deck: quiz!.deck, answered: quiz!.answered, login: quiz!.login, signups: quiz!.signups, traders: quiz!.traders },
      { sessions: 3, engaged: 1, deck: 1, answered: 1, login: 1, signups: 2, traders: 1 },
    );
    assert.deepEqual(
      { sessions: generic!.sessions, engaged: generic!.engaged, signups: generic!.signups },
      { sessions: 1, engaged: 1, signups: 0 },
    );
    assert.equal(rows.some((x) => x.key.startsWith("google / demandgen") === false && x.sessions > 0), false, "no organic row");
  });

  await test("an account from a campaign that sent no session in range still shows up", async () => {
    await db.insert(users).values({ email: "u4@t.local", name: "u4", utmSource: "google", utmMedium: "cpc", utmCampaign: "old-click" });
    const rows = await getPaidCampaigns(r);
    const row = rows.find((x) => x.key === "google / cpc / old-click");
    assert.ok(row, "row exists");
    assert.deepEqual({ sessions: row!.sessions, signups: row!.signups }, { sessions: 0, signups: 1 });
  });

  await test("browser languages are read off the paid landing pageviews only", async () => {
    const langs = await getPaidLanguages(r);
    const by = Object.fromEntries(langs.map((l) => [l.key, l.visitors]));
    assert.deepEqual(by, { he: 2, en: 1, ru: 1 });
  });

  await test("a pageview without the field is reported as unknown, not dropped", async () => {
    await db.insert(analyticsEvents).values([ev({ name: EVENTS.pageview, session: "F", utm: PAID })]);
    const langs = await getPaidLanguages(r);
    assert.equal(langs.find((l) => l.key === "?")?.visitors, 1);
  });

  await test("an account stamped with a bare gclid and no campaign is the campaign's too", async () => {
    // Google's auto-tagging can send a click with a gclid and no utm_* at all
    await db.insert(users).values({ email: "u5@t.local", name: "u5", gclid: "Cj0KCQtest" });
    const f = await getPaidFunnel(r);
    assert.equal(f.stages.find((s) => s.id === "paid_signup")?.count, 4, "u1, u2, u4, u5");
  });

  await test("the issue rules stay quiet under the sample size and speak above it", async () => {
    const before = await getIssues(r);
    assert.equal(before.some((i) => i.id === "paid-no-touch"), false, "5 sessions is not evidence");
    // 40 more bounced paid sessions: 45 sessions, 2 touched → both rules fire
    const rows = [];
    for (let i = 0; i < 40; i++) rows.push(ev({ name: EVENTS.pageview, session: `bounce-${i}`, utm: PAID }));
    await db.insert(analyticsEvents).values(rows);
    const after = await getIssues(r);
    assert.ok(after.some((i) => i.id === "paid-no-touch"), "no-touch fires");
    // accounts exist, so no-signup must NOT fire
    assert.equal(after.some((i) => i.id === "paid-no-signup"), false, "there are paid signups");
  });

  if (failures.length) {
    console.error(`\npaid-funnel: ${failures.length} failed\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`paid-funnel: ${passed} tests passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
