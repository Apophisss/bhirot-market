/**
 * Tests for the metadata every page ships with.
 *
 * Half of this is a unit test of `shareCard`, and half is a source check over
 * `src/app`, because the bug that motivated it is invisible to a unit test: Next
 * merges metadata shallowly, so a page that wrote its own `openGraph: { ... }`
 * silently dropped the layout's og:image, og:site_name, og:locale and og:type and
 * left the Twitter card advertising the home page. Nothing failed — the tags just
 * went missing. The guard below is therefore about who is allowed to write those
 * two keys at all: `src/lib/seo.ts` and the root layout, and nobody else.
 * No framework — plain assertions so it runs anywhere `tsx` runs. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "../src/lib/config";
import { LLMS_RESOLVED_LIMIT, renderLlmsTxt, type LlmsMarket } from "../src/lib/llms-txt";
import { absUrl, clamp, shareCard } from "../src/lib/seo";
import { fit } from "../src/lib/og";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const APP = path.join(process.cwd(), "src", "app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const appFiles = walk(APP);
const rel = (f: string) => path.relative(process.cwd(), f);

// Next types `openGraph`/`twitter` as unions over every card shape, so reading a
// field off them needs a narrowing the assertions themselves do not care about
type Card = ReturnType<typeof shareCard>;
const og = (c: Card) => c.openGraph as Record<string, unknown>;
const tw = (c: Card) => c.twitter as Record<string, unknown>;

/* ---------- the card is always complete ---------- */

test("shareCard fills in everything the layout would have contributed", () => {
  const card = og(shareCard({ title: "כותרת", description: "תיאור", path: "/about" }));
  assert.equal(card.type, "website");
  assert.equal(card.siteName, SITE_NAME);
  assert.equal(card.locale, "he_IL");
  assert.equal(card.url, "/about");
  assert.equal(card.title, "כותרת");
  assert.equal(card.description, "תיאור");
  assert.deepEqual(card.images, [
    { url: "/og.png", width: 1200, height: 630, alt: `${SITE_NAME} — ${SITE_TAGLINE}` },
  ]);
});

test("the Twitter card repeats the page's own title, not the site's", () => {
  const card = tw(shareCard({ title: "לוח המובילים | בחירות מרקט", description: "מי מוביל", path: "/leaderboard" }));
  assert.equal(card.card, "summary_large_image");
  assert.equal(card.title, "לוח המובילים | בחירות מרקט");
  assert.equal(card.description, "מי מוביל");
  assert.deepEqual(card.images, ["/og.png"]);
});

test("a page without its own description falls back to the site one", () => {
  const card = shareCard({ title: "כותרת", path: "/" });
  assert.equal(og(card).description, SITE_DESCRIPTION);
  assert.equal(tw(card).description, SITE_DESCRIPTION);
});

test("a page's own picture reaches both cards", () => {
  const card = shareCard({
    title: "שאלה",
    path: "/market/x",
    images: [{ url: "/market/x/og", width: 1200, height: 630, alt: "שאלה" }],
  });
  assert.deepEqual(tw(card).images, ["/market/x/og"]);
  assert.deepEqual(og(card).images, [{ url: "/market/x/og", width: 1200, height: 630, alt: "שאלה" }]);
});

test("images: null leaves the image out of both cards rather than defaulting", () => {
  const card = shareCard({ title: "x", path: "/x", images: null });
  assert.equal("images" in og(card), false);
  assert.equal("images" in tw(card), false);
});

test("an article carries its dates and section", () => {
  const card = og(
    shareCard({
      title: "שאלה",
      path: "/market/x",
      type: "article",
      article: { publishedTime: "2026-01-01T00:00:00.000Z", section: "סקרים", tags: ["בחירות"] },
    }),
  );
  assert.equal(card.type, "article");
  assert.equal(card.publishedTime, "2026-01-01T00:00:00.000Z");
  assert.equal(card.section, "סקרים");
});

/* ---------- no page may hand-roll the two keys again ---------- */

const CARD_OWNERS = new Set([path.join(APP, "layout.tsx")]);

test("only the root layout writes openGraph/twitter by hand — every page goes through shareCard", () => {
  const offenders = appFiles
    .filter((f) => !CARD_OWNERS.has(f))
    .filter((f) => /^\s*(openGraph|twitter):/m.test(readFileSync(f, "utf8")))
    .map(rel);
  assert.deepEqual(
    offenders,
    [],
    `these files replace the layout's share card instead of rebuilding it with shareCard(): ${offenders.join(", ")}`,
  );
});

/* ---------- every page says whether it belongs in the index ---------- */

// pages whose whole segment is settled by a layout above them
const INDEX_EXEMPT = [path.join(APP, "admin")];

test("every page declares either a canonical or a robots rule", () => {
  const missing = appFiles
    .filter((f) => path.basename(f) === "page.tsx")
    .filter((f) => !INDEX_EXEMPT.some((dir) => f.startsWith(dir + path.sep)))
    .filter((f) => {
      const src = readFileSync(f, "utf8");
      return !/alternates:\s*\{\s*canonical/.test(src) && !/robots:\s*\{/.test(src);
    })
    .map(rel);
  assert.deepEqual(missing, [], `no canonical and no robots rule: ${missing.join(", ")}`);
});

test("a filtered listing is never canonicalised onto itself", () => {
  // /?q=, ?sort=, ?show= and the rapid deck's switches must resolve to noindex,
  // not to a canonical, or every filter combination competes with the page it filters
  for (const f of ["(listing)/page.tsx", "category/[id]/page.tsx", "rapid/page.tsx"]) {
    const src = readFileSync(path.join(APP, f), "utf8");
    assert.match(src, /robots:\s*\{\s*index:\s*false/, `${f} has no noindex branch for its filtered variants`);
  }
});

/* ---------- absolute URLs ---------- */

test("absUrl resolves against the configured site", () => {
  assert.equal(absUrl("/about"), `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/about`);
  assert.equal(absUrl("/"), absUrl());
});

/* ---------- text that has to fit ---------- */

test("clamp never returns more than it was asked for, and never breaks a word", () => {
  const long = "מילה ".repeat(80).trim();
  const out = clamp(long, 155);
  assert.ok(out.length <= 156, `got ${out.length}`);
  assert.ok(out.endsWith("…"));
  assert.equal(clamp("קצר", 155), "קצר");
});

test("fit clamps card text the same way", () => {
  assert.equal(fit("שאלה  קצרה", 40), "שאלה קצרה");
  const out = fit("א".repeat(200), 130);
  assert.ok(out.length <= 131, `got ${out.length}`);
  assert.ok(out.endsWith("…"));
});

/* ---------- the machine-readable files at the root ---------- */

function market(over: Partial<LlmsMarket> & { id: string; title: string }): LlmsMarket {
  return {
    category: "polls",
    probability: 0.34,
    volume: 1234,
    tradeCount: 7,
    closesAt: new Date("2026-09-15T20:59:59+03:00"),
    status: "open",
    resolution: null,
    resolutionNote: null,
    resolvedAt: null,
    isTradable: true,
    ...over,
  };
}

test("llms.txt opens the way the convention says: an h1, then a one-blockquote summary", () => {
  const lines = renderLlmsTxt({ open: [], resolved: [] }).split("\n").filter((l) => l.trim());
  assert.match(lines[0], new RegExp(`^# ${SITE_NAME}`));
  assert.equal(lines[1], `> ${SITE_DESCRIPTION}`);
});

test("llms.txt says the score is points and that the number is not a poll", () => {
  const txt = renderLlmsTxt({ open: [], resolved: [] });
  assert.match(txt, /נקודות משחק/);
  assert.match(txt, /לא סקר/);
  // the one description a model must never repeat back about this site
  assert.doesNotMatch(txt, /שוק חיזויים/);
  // the model is told how to attribute a number before it is given any
  assert.ok(txt.indexOf("איך לצטט") < txt.indexOf("## שאלות פתוחות"));
});

test("an open question is listed with its price, its deadline in Israel time and its own URL", () => {
  const txt = renderLlmsTxt({ open: [market({ id: "poll-likud-30", title: "האם הליכוד יקבל 30 מנדטים?" })], resolved: [] });
  assert.match(txt, /## שאלות פתוחות \(1\)/);
  assert.match(txt, /### סקרים/);
  assert.match(txt, new RegExp(`\\[האם הליכוד יקבל 30 מנדטים\\?\\]\\(${SITE_URL}/market/poll-likud-30\\)`));
  assert.match(txt, /34% כן/);
  assert.match(txt, /נסגר 2026-09-15 20:59/);
});

// Most of the board reaches this branch: 284 of the ~349 open questions have never
// been answered, and the file quotes the recorded pair, so it says "טרם נענתה" rather
// than printing "0 תשובות · 0 נקודות ששוחקו".
test("a question with no activity to show says so rather than showing a zero", () => {
  const txt = renderLlmsTxt({
    open: [market({ id: "x", title: "שאלה", tradeCount: 0, volume: 0 })],
    resolved: [],
  });
  assert.match(txt, /טרם נענתה/);
});

/*
 * The pair this file quotes used to be the fabricated one, which meant a model asked
 * about a question was handed a number the site itself does not hold and could repeat
 * it as fact. The inflated pair lives on `MarketView` beside the recorded one, so a
 * fixture carrying both is the only way to prove which of the two comes out.
 */
test("llms.txt quotes the recorded answers and points, never the inflated pair", () => {
  const txt = renderLlmsTxt({
    open: [
      Object.assign(market({ id: "x", title: "שאלה נסחרת", tradeCount: 2, volume: 40 }), {
        displayTradeCount: 137,
        displayVolume: 4321,
      }),
    ],
    resolved: [],
  });
  assert.match(txt, /2 תשובות/);
  assert.match(txt, /40 נקודות ששוחקו/);
  assert.doesNotMatch(txt, /137/);
  assert.doesNotMatch(txt, /4,321/);
});

test("a question past its deadline is not offered as open", () => {
  const txt = renderLlmsTxt({ open: [market({ id: "x", title: "שאלה שנסגרה", isTradable: false })], resolved: [] });
  assert.match(txt, /## שאלות פתוחות \(0\)/);
  assert.doesNotMatch(txt, /שאלה שנסגרה/);
});

test("a category with nothing open in it is not listed", () => {
  const txt = renderLlmsTxt({ open: [market({ id: "x", title: "שאלה", category: "polls" })], resolved: [] });
  assert.match(txt, /\[סקרים\]/);
  assert.doesNotMatch(txt, /\[נתניהו\]/);
});

test("resolutions are the newest ones, in order, and a cancelled market is not a result", () => {
  const resolved: LlmsMarket[] = [
    market({ id: "old", title: "ישנה", status: "resolved", resolution: "NO", resolvedAt: new Date("2026-08-01T10:00:00Z"), resolutionNote: "לא קרה.\n\nמקור: https://example.com" }),
    market({ id: "new", title: "חדשה", status: "resolved", resolution: "YES", resolvedAt: new Date("2026-09-01T10:00:00Z") }),
    market({ id: "gone", title: "בוטלה", status: "cancelled", resolvedAt: new Date("2026-09-02T10:00:00Z") }),
  ];
  const txt = renderLlmsTxt({ open: [], resolved });
  assert.ok(txt.indexOf("חדשה") < txt.indexOf("ישנה"), "resolutions are not newest-first");
  assert.doesNotMatch(txt, /בוטלה/);
  // only the first line of the note travels: the rest is the source link, already on the page
  assert.match(txt, /  לא קרה\.$/m);
});

test("llms.txt keeps the resolution list short", () => {
  const resolved = Array.from({ length: LLMS_RESOLVED_LIMIT + 5 }, (_, i) =>
    market({ id: `m${i}`, title: `הכרעה ${i}`, status: "resolved", resolution: "YES", resolvedAt: new Date(2026, 0, i + 1) }),
  );
  const listed = renderLlmsTxt({ open: [], resolved }).match(/^- \[הכרעה /gm) ?? [];
  assert.equal(listed.length, LLMS_RESOLVED_LIMIT);
});

test("ads.txt declares that nobody may sell this domain's inventory", () => {
  const lines = readFileSync(path.join(process.cwd(), "public", "ads.txt"), "utf8")
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean);
  assert.equal(lines.length, 1, `ads.txt should hold exactly one record, got ${lines.length}`);
  // <exchange domain>, <publisher id>, DIRECT|RESELLER[, <certification id>]
  for (const line of lines) {
    const fields = line.split(",").map((f) => f.trim());
    assert.ok(fields.length === 3 || fields.length === 4, `malformed ads.txt record: ${line}`);
    assert.match(fields[2], /^(DIRECT|RESELLER)$/, `field 3 must be DIRECT or RESELLER: ${line}`);
  }
});

console.log(`seo: ${passed} tests passed`);
