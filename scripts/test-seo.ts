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
import { CATEGORIES } from "../src/lib/categories";
import { LLMS_RESOLVED_LIMIT, renderLlmsTxt, type LlmsMarket } from "../src/lib/llms-txt";
import { SITE_OG_IMAGE, absUrl, categoryTitle, clamp, shareCard } from "../src/lib/seo";
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

/* ---------- the picture the card points at ---------- */

/*
  WhatsApp is where this site's links get forwarded, and it stops drawing a preview
  card for an og:image somewhere around 300KB — past that the message arrives as a
  bare link with nothing under it. `og.png` was 303,151 bytes, which put the home
  page, every category, /welcome and every invite link exactly on that edge. 100KB is
  the budget: clear of the ceiling, and quick on a phone.
*/
const OG_IMAGE_MAX_BYTES = 100 * 1024;

const ogImageFile = () => path.join(process.cwd(), "public", SITE_OG_IMAGE.url.replace(/^\//, ""));

test("the site share card is small enough for WhatsApp to fetch and draw", () => {
  const bytes = statSync(ogImageFile()).size;
  assert.ok(
    bytes <= OG_IMAGE_MAX_BYTES,
    `public${SITE_OG_IMAGE.url} is ${bytes} bytes; the WhatsApp budget is ${OG_IMAGE_MAX_BYTES}`,
  );
});

test("the card declares the size the file actually is", () => {
  // a scraper that is handed the wrong og:image:width crops or refuses the picture,
  // so the two numbers in seo.ts are checked against the bytes rather than trusted
  assert.match(SITE_OG_IMAGE.url, /\.png$/, "this reader knows PNG only — teach it the new format first");
  // IHDR is the first chunk of every PNG: an 8-byte signature, a 4-byte length, the tag, then w/h
  const buf = readFileSync(ogImageFile());
  assert.equal(buf.toString("latin1", 12, 16), "IHDR", `${SITE_OG_IMAGE.url} is not a PNG`);
  assert.equal(buf.readUInt32BE(16), SITE_OG_IMAGE.width);
  assert.equal(buf.readUInt32BE(20), SITE_OG_IMAGE.height);
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

test("the 404 leaves the one noindex Next already emits, and does not add a second", () => {
  const src = readFileSync(path.join(APP, "not-found.tsx"), "utf8");
  // `robots: null` drops the layout's inherited `index, follow`; anything else here —
  // including a correct-looking `index: false` — ships a duplicate robots meta
  assert.match(src, /robots:\s*null/, "src/app/not-found.tsx must clear the inherited robots rule with null");
});

test("a filtered listing is never canonicalised onto itself", () => {
  // /?q=, ?sort=, ?show= and the rapid deck's switches must resolve to noindex,
  // not to a canonical, or every filter combination competes with the page it filters
  for (const f of ["(listing)/page.tsx", "category/[id]/page.tsx", "rapid/page.tsx"]) {
    const src = readFileSync(path.join(APP, f), "utf8");
    assert.match(src, /robots:\s*\{\s*index:\s*false/, `${f} has no noindex branch for its filtered variants`);
  }
});

/* ---------- the sitemap only asks for pages we want indexed ---------- */

/** The route a page.tsx serves, with Next's `(group)` folders removed. */
function routeOf(file: string): string {
  const segs = path
    .relative(APP, path.dirname(file))
    .split(path.sep)
    .filter((s) => s && !/^\(.+\)$/.test(s));
  return `/${segs.join("/")}`;
}

const ROUTES = new Map(appFiles.filter((f) => path.basename(f) === "page.tsx").map((f) => [routeOf(f), f]));

/**
 * A page with a noindex rule and no canonical anywhere in it: nothing on it is ever
 * meant to be indexed. A page that has both is the conditional shape the listings use
 * — one branch per URL — and its canonical URL is the one the sitemap submits.
 */
function neverIndexed(file: string): boolean {
  const src = readFileSync(file, "utf8");
  return /robots:\s*\{\s*index:\s*false/.test(src) && !/alternates:\s*\{\s*canonical/.test(src);
}

/**
 * The page that answers a URL taken out of the sitemap source. `${SITE_URL}/market/${m.id}`
 * leaves only the prefix once the interpolation is cut off, so a prefix with no page of
 * its own is matched against the dynamic segment underneath it.
 */
function pageFor(route: string): string | undefined {
  const exact = ROUTES.get(route === "" ? "/" : route);
  if (exact) return exact;
  const dynamic = [...ROUTES.keys()].find((r) => new RegExp(`^${route}/\\[[^/]+\\]$`).test(r));
  return dynamic ? ROUTES.get(dynamic) : undefined;
}

test("the sitemap asks for nothing that carries a noindex", () => {
  // Submitting a noindex URL is a straight contradiction: it spends crawl budget to
  // fetch a page whose only instruction is "forget this page". Whichever way it is
  // resolved — the page loses its noindex, or the URL leaves this list — it cannot
  // stay as it is, which is why this fails rather than warns.
  const src = readFileSync(path.join(APP, "sitemap.ts"), "utf8");
  const submitted = new Set(
    [...src.matchAll(/\$\{SITE_URL\}(\/[^`?"'$\s]*)/g)]
      .map((m) => m[1].replace(/\/$/, ""))
      // the bare `SITE_URL` entry, which is the home page
      .concat("", "/"),
  );
  const offenders = [...submitted]
    .map((p) => [p, pageFor(p)] as const)
    .filter(([, file]) => file && neverIndexed(file))
    .map(([p]) => p || "/");
  assert.deepEqual(offenders, [], `these sitemap URLs point at pages that say noindex: ${offenders.join(", ")}`);
});

test("robots.txt does not close a door llms.txt tells agents to walk through", () => {
  const llms = renderLlmsTxt({ open: [], resolved: [] });
  const robots = readFileSync(path.join(APP, "robots.ts"), "utf8");
  // every /api path llms.txt advertises has to be reachable by an agent that obeys
  // robots.txt — the well-behaved ones are the whole audience that file was written for
  const advertised = new Set([...llms.matchAll(/\/api\/[a-z0-9-]+/g)].map((m) => m[0]));
  assert.ok(advertised.size > 0, "llms.txt no longer points at the API — drop this test with it");
  for (const p of advertised) {
    assert.match(robots, new RegExp(`allow:[^;]*"${p}"`, "s"), `robots.ts blocks ${p}, which llms.txt hands out`);
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

/*
  What actually fits in a result. Google cuts a title around 60 characters and a
  description around 155, and Hebrew gets no allowance for being narrower — the cut is
  by pixel width, and these two numbers are the conservative reading of it. A title
  that overflows loses its tail, which on this site is the part that says which
  category the page is; a description under 70 characters gets replaced with whatever
  text Google finds on the page instead.
*/
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 155;

test("the site's own title and description fit a search result", () => {
  const title = `${SITE_NAME} — ${SITE_TAGLINE}`;
  assert.ok(title.length <= TITLE_MAX, `the default title is ${title.length} chars: ${title}`);
  assert.ok(SITE_DESCRIPTION.length <= DESC_MAX, `SITE_DESCRIPTION is ${SITE_DESCRIPTION.length} chars`);
  assert.ok(SITE_DESCRIPTION.length >= DESC_MIN, `SITE_DESCRIPTION is only ${SITE_DESCRIPTION.length} chars`);
});

test("every category page's title and description fit one", () => {
  for (const cat of CATEGORIES) {
    // the root layout appends " | <site>" to every page title, so that is the string
    // that reaches the result — not the one the page declares
    const title = `${categoryTitle(cat)} | ${SITE_NAME}`;
    assert.ok(title.length <= TITLE_MAX, `${cat.id}: title is ${title.length} chars — ${title}`);
    assert.ok(cat.description.length <= DESC_MAX, `${cat.id}: description is ${cat.description.length} chars`);
    assert.ok(cat.description.length >= DESC_MIN, `${cat.id}: description is only ${cat.description.length} chars`);
  }
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
