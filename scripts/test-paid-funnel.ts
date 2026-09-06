/**
 * Tests for the reporting queries in src/lib/stats.ts — the paid funnel it was
 * written for (getPaidFunnel, getPaidCampaigns, getPaidLanguages), and everything
 * else the optimisation loop reads: the general funnel, the deck's own telemetry,
 * retention by source, the prop breakdowns and the vitals split by device.
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
 * The later tests add a second layer to the same file, because the queries they
 * cover read the same rows: G–K are runs of the deck (G also opened a question's
 * own page, K is signed in and so answers with a trade), P1–P3 carry the props
 * that were never aggregated, the w/d/l sessions are web-vital samples, and r1/r2
 * are accounts old enough for a retention window to have closed on them.
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
import {
  getFunnel,
  getIssues,
  getMarketMetrics,
  getPaidCampaigns,
  getPaidFunnel,
  getPaidLanguages,
  getPropBreakdowns,
  getRapidCards,
  getRapidRuns,
  getRapidSummary,
  getRetentionBySource,
  getRouteVitals,
  getTimeToFirstTrade,
  getWebVitalsByDevice,
  range,
} from "../src/lib/stats";

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
  /** set on the rows that stand for a signed-in visitor (retention reads this) */
  userId?: string;
  marketId?: string;
  device?: string;
  value?: number;
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
    userId: e.userId ?? null,
    marketId: e.marketId ?? null,
    device: e.device ?? "mobile",
    country: "",
    value: e.value ?? null,
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

  /* ------------------------------------------------------------- the deck --
   * A run of the deck, written the way the browser writes it: `rapid_seen` when a
   * card becomes the top one, a `guest_answer` or a rapid `trade` when it is
   * answered, and one `rapid_session` per run. G opened a question's own page as
   * well; K is signed in, so their answer is a trade and not a guest answer.
   */
  await test("the deck's rows give every question a denominator", async () => {
    await db.insert(markets).values({ id: "m2", title: "שאלה מדולגת", closesAt: new Date(NOW + 86_400_000) });
    const seen = (session: string, marketId: string, pos: number, loggedIn = 0) =>
      ev({ name: EVENTS.rapidSeen, session, path: "/rapid", marketId, props: { pos, loggedIn } });
    await db.insert(analyticsEvents).values([
      ev({ name: EVENTS.pageview, session: "G", path: "/market/m1", marketId: "m1" }),
      ev({ name: EVENTS.pageview, session: "G", path: "/rapid" }),
      seen("G", "m2", 1),
      ev({ name: EVENTS.guestAnswer, session: "G", path: "/rapid", marketId: "m2", props: { surface: "deck", side: "YES", stored: 1 } }),
      seen("G", "m1", 2),
      ev({ name: EVENTS.pageview, session: "H", path: "/rapid" }),
      seen("H", "m2", 1),
      ev({ name: EVENTS.guestAnswer, session: "H", path: "/rapid", marketId: "m2", props: { surface: "deck", side: "NO", stored: 1 } }),
      seen("H", "m1", 2),
      ev({ name: EVENTS.pageview, session: "I", path: "/rapid" }),
      seen("I", "m2", 1),
      seen("I", "m1", 2),
      ev({ name: EVENTS.pageview, session: "J", path: "/rapid" }),
      seen("J", "m2", 1),
      // K is signed in: the deck's answer is a trade the rapid endpoint stamped
      ev({ name: EVENTS.pageview, session: "K", path: "/rapid" }),
      seen("K", "m1", 1, 1),
      ev({ name: EVENTS.trade, session: "K", path: "/rapid", marketId: "m1", value: 20, props: { side: "YES", action: "BUY", rapid: 1 } }),
      // four runs, ending at four different depths
      ev({ name: EVENTS.rapidSession, session: "G", path: "/rapid", props: { shown: 2, answered: 0, skipped: 2, seconds: 8, guest: 1 } }),
      ev({ name: EVENTS.rapidSession, session: "H", path: "/rapid", props: { shown: 5, answered: 2, skipped: 3, seconds: 40, guest: 1 } }),
      ev({ name: EVENTS.rapidSession, session: "I", path: "/rapid", props: { shown: 6, answered: 3, skipped: 3, seconds: 60, guest: 1 } }),
      ev({ name: EVENTS.rapidSession, session: "K", path: "/rapid", props: { shown: 15, answered: 12, skipped: 3, seconds: 300, guest: 0 } }),
    ]);

    const cards = await getRapidCards(r, 10, 3);
    const m2 = cards.find((c) => c.marketId === "m2");
    const m1 = cards.find((c) => c.marketId === "m1");
    assert.ok(m2 && m1, "both questions were shown enough times to be listed");
    assert.equal(m2!.title, "שאלה מדולגת", "the title comes from the market table");
    assert.deepEqual(
      { shown: m2!.shown, answered: m2!.answered, skipped: m2!.skipped },
      { shown: 4, answered: 2, skipped: 2 },
      "G H I J saw it, G and H answered",
    );
    assert.deepEqual(
      { shown: m1!.shown, answered: m1!.answered, skipped: m1!.skipped },
      { shown: 4, answered: 1, skipped: 3 },
      "a signed-in answer is a rapid trade, and it counts the same",
    );
    // the point of the ordering: the most-skipped question is the first thing read
    assert.equal(cards[0].marketId, "m1", "ordered by skip rate");
  });

  await test("run depth is a histogram and not an average", async () => {
    const runs = await getRapidRuns(r);
    assert.deepEqual(
      runs.map((d) => [d.label, d.runs, d.guestRuns]),
      [
        ["0", 1, 1],
        ["2", 1, 1],
        ["3", 1, 1],
        ["11+", 1, 0],
      ],
      "one row per depth, guests counted apart — 11+ is a run that outlived the free one",
    );
    const s = await getRapidSummary(r);
    assert.deepEqual(
      { runs: s.runs, guestRuns: s.guestRuns, shown: s.shown, answered: s.answered },
      { runs: 4, guestRuns: 3, shown: 28, answered: 17 },
    );
    assert.equal(s.answersPerRun, 17 / 4);
    assert.equal(s.answerRate, 17 / 28);
    assert.equal(s.avgSeconds, (8 + 40 + 60 + 300) / 4);
  });

  await test("the general funnel counts a question seen in the deck", async () => {
    const f = await getFunnel(r);
    const by = Object.fromEntries(f.map((s) => [s.id, s.count]));
    // A and C from the paid fixture, then G H I J K: rapid mode never opens a
    // market page, and before this stage two counted only those who did
    assert.equal(by.question_view, 7, "market page or /rapid");
    assert.equal(by.deck_answer, 5, "A C G H answered as guests, K as a signed-in trade");
    assert.equal(by.trade_intent, 5, "nobody used the trade panel in this fixture");
    assert.equal(f.find((s) => s.id === "signup")?.rate, null, "accounts are not browser-days");
    // the property the whole fix is about: a subset never converts above 100%
    assert.ok(
      f.every((s) => s.rate == null || s.rate <= 1),
      `a stage converted above 100%: ${JSON.stringify(f)}`,
    );
  });

  await test("a question answered in the deck cannot convert above 100%", async () => {
    const rows = await getMarketMetrics(r, { limit: 50 });
    const m1 = rows.find((m) => m.slug === "m1");
    assert.ok(m1, "m1 is in the table");
    // one visitor opened the page, four were shown the question, two accounts
    // answered it: the old denominator (page visitors) made that 200%
    assert.equal(m1!.visitors, 1, "the page itself");
    assert.equal(m1!.reach, 4, "page or deck — G H I K");
    assert.equal(m1!.traders, 2);
    assert.equal(m1!.conversion, 2 / 4);
    assert.ok(
      rows.every((m) => m.conversion <= 1),
      "no question converts above 100%",
    );
  });

  /* ------------------------------------------------------- retention by source */
  await test("retention and time to first answer are split by where the account came from", async () => {
    // 09:00 Israel time, ten days ago: a fixed hour so "same day" cannot depend on
    // what time of day the suite happens to run
    const d = new Date(NOW - 10 * 86_400_000);
    const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0);
    const [r1] = await db
      .insert(users)
      .values({ email: "r1@t.local", name: "r1", utmSource: "google", utmMedium: "demandgen", utmCampaign: "quiz", createdAt: new Date(base) })
      .returning();
    const [r2] = await db
      .insert(users)
      .values({ email: "r2@t.local", name: "r2", referredBy: u1.id, createdAt: new Date(base) })
      .returning();
    const answer = (userId: string, at: number) => ({
      userId,
      marketId: "m1",
      side: "YES" as const,
      action: "BUY" as const,
      shares: 1,
      amount: 1,
      priceBefore: 0.5,
      priceAfter: 0.5,
      createdAt: new Date(at),
    });
    await db.insert(trades).values([answer(r1.id, base + 45 * 60_000), answer(r2.id, base + 120 * 60_000)]);
    await db.insert(analyticsEvents).values([
      // r1 came back the next day; r2 only three days later
      ev({ name: EVENTS.pageview, session: "ret1", path: "/rapid", userId: r1.id, at: base + 30 * 3_600_000 }),
      ev({ name: EVENTS.pageview, session: "ret2", path: "/rapid", userId: r2.id, at: base + 3 * 86_400_000 }),
    ]);

    const rows = await getRetentionBySource(30, NOW + 1000);
    const quiz = rows.find((x) => x.key === "quiz");
    const invite = rows.find((x) => x.key === "invite");
    assert.ok(quiz && invite, "a row per source");
    assert.deepEqual(
      { users: quiz!.users, eligibleD1: quiz!.eligibleD1, d1: quiz!.d1, eligibleD7: quiz!.eligibleD7, d7: quiz!.d7 },
      { users: 3, eligibleD1: 1, d1: 1, eligibleD7: 1, d7: 1 },
      "u1 and u2 signed up moments ago — the window has not closed on them, so they are not in the denominator",
    );
    assert.deepEqual(
      { users: invite!.users, d1: invite!.d1, d7: invite!.d7 },
      { users: 1, d1: 0, d7: 1 },
      "a return three days later is a D7 and not a D1",
    );
    assert.ok(rows.some((x) => x.key === "paid"), "the gclid-only account is the campaign's, not organic");

    const first = await getTimeToFirstTrade(30, NOW + 1000);
    const inviteFirst = first.find((x) => x.key === "invite");
    assert.deepEqual(
      { accounts: inviteFirst!.accounts, traded: inviteFirst!.traded, medianMinutes: inviteFirst!.medianMinutes, sameDay: inviteFirst!.sameDay },
      { accounts: 1, traded: 1, medianMinutes: 120, sameDay: 1 },
    );
    assert.equal(first.find((x) => x.key === "quiz")?.traded, 2, "u1 and r1");
  });

  /* --------------------------------------------------------- prop breakdowns */
  await test("props that were only ever collected are now summarised", async () => {
    await db.insert(analyticsEvents).values([
      ev({ name: EVENTS.pageview, session: "P1", props: { first: 1, webview: 1 } }),
      ev({ name: EVENTS.pageview, session: "P2", props: { first: 1, webview: 1 } }),
      ev({ name: EVENTS.pageview, session: "P3", props: { first: 0, webview: 0 } }),
      ev({ name: EVENTS.installApp, session: "P1", props: { action: "shown", platform: "ios" } }),
      ev({ name: EVENTS.installApp, session: "P2", props: { action: "shown", platform: "ios" } }),
      ev({ name: EVENTS.installApp, session: "P3", props: { action: "accepted", platform: "android" } }),
      ev({ name: EVENTS.loginError, session: "P1", path: "/login", props: { error: "OAuthCallback" } }),
      ev({ name: EVENTS.tradeError, session: "K", path: "/rapid", props: { reason: "אין מספיק נקודות", rapid: 1 } }),
      ev({ name: EVENTS.survey, session: "P3", props: { status: "done" } }),
      ev({ name: EVENTS.landing, session: "", visitor: "v-P4", utm: PAID, props: { webview: 1, lang: "he" } }),
    ]);
    const p = await getPropBreakdowns(r);
    assert.equal(p.webview.find((x) => x.key === "1")?.count, 2, "two views inside an in-app browser");
    assert.equal(p.webview.find((x) => x.key === "0")?.count, 1);
    assert.equal(p.firstVisit.find((x) => x.key === "1")?.count, 2);
    assert.equal(p.installApp.find((x) => x.key === "shown · ios")?.count, 2, "two props, one key");
    assert.equal(p.installApp.find((x) => x.key === "accepted · android")?.count, 1);
    assert.equal(p.loginErrors.find((x) => x.key === "OAuthCallback")?.count, 1);
    assert.equal(p.tradeErrors.find((x) => x.key === "אין מספיק נקודות")?.count, 1);
    assert.equal(p.survey.find((x) => x.key === "done")?.count, 1);
    assert.equal(p.guestGate.find((x) => x.key === "10")?.count, 1, "the wall went up over ten answers");
    assert.equal(p.landingWebview.find((x) => x.key === "1")?.count, 1);
    assert.equal(p.landingLang.find((x) => x.key === "he")?.count, 1);
    // a pageview from before the field existed is reported, not dropped
    assert.ok((p.webview.find((x) => x.key === "?")?.count ?? 0) > 0);
  });

  /* ---------------------------------------------------------------- vitals -- */
  await test("vitals split by device, and the deck's own responsiveness is a rule", async () => {
    const vital = (session: string, path: string, device: string, metric: string, value: number) =>
      ev({ name: EVENTS.webVital, session, path, device, value, props: { metric, rating: "" } });
    await db.insert(analyticsEvents).values([
      // the phone is where the players are, and where the deck is slow
      ...[120, 260, 300, 340, 380, 420, 440, 460].map((v, i) => vital(`w${i}`, "/rapid", "mobile", "INP", v)),
      ...[100, 100, 100, 100, 100, 100, 100, 100].map((v, i) => vital(`d${i}`, "/rapid", "desktop", "INP", v)),
      ...[1000, 2000, 3000, 4000].map((v, i) => vital(`l${i}`, "/", "mobile", "LCP", v)),
    ]);
    const byDevice = await getWebVitalsByDevice(r);
    const inpMobile = byDevice.find((v) => v.metric === "INP" && v.device === "mobile");
    const inpDesktop = byDevice.find((v) => v.metric === "INP" && v.device === "desktop");
    assert.equal(inpMobile?.samples, 8);
    assert.equal(inpMobile?.p75, 420, "the phone's p75, not the blend");
    assert.equal(inpDesktop?.p75, 100, "and the desktop that is fine cannot hide it");
    assert.equal(byDevice.find((v) => v.metric === "LCP" && v.device === "mobile")?.p75, 3000);

    const routes = await getRouteVitals(r, ["INP"]);
    const rapidMobile = routes.find((v) => v.path === "/rapid" && v.device === "mobile");
    assert.equal(rapidMobile?.p75, 420);
    assert.equal(routes[0].p75, 420, "slowest route first");

    const issues = await getIssues(r);
    const inp = issues.find((i) => i.id === "slow-inp-rapid");
    assert.ok(inp, "INP p75 over 200ms in the deck is a finding");
    assert.ok(inp!.title.includes("420") && inp!.title.includes("mobile"), inp!.title);
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
