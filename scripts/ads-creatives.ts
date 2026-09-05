/**
 * Generates the image and text assets a Google Ads Demand Gen campaign needs.
 *
 * Each image is a picture of the product: the question, its trend line drawn by
 * the site's own chart generator, and the green "כן" / red "לא" buttons — under
 * a headline saying what the site is and above the virtual-money disclosure.
 *
 * Two sets, because Google treats them differently:
 *
 *   --set=generic (default)  The pitch, on a card carrying a written sample
 *                            question, plus any real market whose title names
 *                            no politician and no party. Nothing here reads as
 *                            an election ad, so it runs without Google's Israel
 *                            election-advertiser verification.
 *   --set=named              The real headline questions, names and all. Higher
 *                            click-through, but the account must be verified for
 *                            election ads first, and every ad carries a paid-for
 *                            disclosure.
 *
 * Output lands in ads/creatives/ as one HTML file per creative per aspect ratio.
 * Pass --png to rasterise them with a local Chrome/Chromium, which is what the
 * Ads UI actually accepts.
 *
 *   npm run ads:creatives -- --set=named --png
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { deflateSync, inflateSync } from "node:zlib";
import path from "node:path";
import { DEFAULT_SYNTH_CONFIG, SYNTH_HARD_MAX_DEVIATION, buildDisplayHistory } from "../src/lib/synthetic-history";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "ads", "creatives");

/* ---------------- inputs ---------------- */

interface Market {
  slug: string;
  title: string;
  subtitle?: string;
  category: string;
  people?: string[];
  tags?: string[];
  status: string;
  featured?: boolean;
  closesAt: string;
  initialProbability: number;
}

const markets: Market[] = JSON.parse(readFileSync(path.join(ROOT, "data", "markets.json"), "utf8")).markets;
const people: { id: string; name: string }[] = JSON.parse(readFileSync(path.join(ROOT, "data", "people.json"), "utf8")).people;

/** Parties are not in people.json, and a party name makes an ad an election ad just as surely as a person's does. */
const PARTIES = [
  "ליכוד", "יש עתיד", "כחול לבן", "המחנה הממלכתי", "ש\"ס", "שס", "יהדות התורה", "דגל התורה", "אגודת ישראל",
  "עוצמה יהודית", "הציונות הדתית", "נעם", "ישראל ביתנו", "הדמוקרטים", "העבודה", "מרצ", "רע\"ם", "חד\"ש", "תע\"ל",
  "בל\"ד", "בנט", "הליכוד",
];

const NAME_WORDS = [
  ...people.flatMap((p) => p.name.split(/\s+/).filter((w) => w.length > 2)),
  ...PARTIES,
];

/**
 * True when nothing that will appear in the image could make Google read the ad
 * as election advertising.
 *
 * The title only: `people[]` is board metadata used for filtering and avatars,
 * and never reaches the creative. Judging by the tags instead would reject 326
 * of 327 open markets over names the viewer never sees.
 */
function isNameFree(m: Market): boolean {
  return !NAME_WORDS.some((w) => m.title.includes(w));
}

/* ---------------- selection ---------------- */

/**
 * A market earns a slot by being interesting to a stranger, which is not the
 * same as being important: a probability near 50 says "nobody knows" and reads
 * as noise, while one near 0 or 100 reads as settled. The pull is in between.
 */
function score(m: Market, now: number): number {
  const p = m.initialProbability;
  const distance = Math.abs(p - 0.5);
  const tension = distance > 0.08 && distance < 0.42 ? 1 : 0.35;
  const days = (new Date(m.closesAt).getTime() - now) / 86_400_000;
  const urgency = days <= 0 ? 0 : days < 30 ? 1 : days < 120 ? 0.7 : 0.4;
  const brevity = m.title.length <= 60 ? 1 : m.title.length <= 85 ? 0.7 : 0.35;
  return tension * urgency * brevity * (m.featured ? 1.25 : 1);
}

function pickMarkets(nameFreeOnly: boolean, limit: number): Market[] {
  const now = Date.now();
  return markets
    .filter((m) => m.status === "open" && new Date(m.closesAt).getTime() > now)
    .filter((m) => (nameFreeOnly ? isNameFree(m) : true))
    .map((m) => ({ m, s: score(m, now) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.m);
}

/* ---------------- creatives ---------------- */

interface Creative {
  id: string;
  /** The pitch, in the visitor's language, above the product card. */
  headline: string;
  /** The question on the card. */
  question: string;
  /** YES probability, 0-1. Drives the chart, the split and the two buttons. */
  probability: number;
  /**
   * True when the question is written for the ad rather than taken off the board.
   * These cards carry a "דוגמה" chip: an invented percentage beside a real
   * political event would otherwise read as a poll result rather than as a
   * picture of the product.
   */
  sample: boolean;
  /** Seed for the price curve, so a creative redraws identically every run. */
  seed: string;
  /** Category chip on the card — id and colour come from src/lib/categories.ts. */
  category: string;
}

/**
 * The `generic` set: the pitch, with a sample question standing in for the board.
 *
 * Every line here is deliberately name-free — no politician, no party — so the
 * ad does not fall under Israel's election-advertising rules. It also names no
 * competitor: a rival's trademark in ad text is a routine disapproval under
 * Google's trademark policy, so the category is described instead.
 */
const SAMPLE_CREATIVES: Creative[] = [
  {
    id: "pitch-know-your-people",
    headline: "אתם מכירים את העם שלכם?",
    question: "האם תוקם ממשלה תוך 45 יום מהבחירות?",
    probability: 0.41,
    sample: true,
    seed: "coalition",
    category: "coalition",
  },
  {
    id: "pitch-free-market",
    headline: "שוק חיזויים על הבחירות בישראל.\nהשתתפות חינם.",
    question: "האם מפלגה חדשה תעבור את אחוז החסימה?",
    probability: 0.78,
    sample: true,
    seed: "newparty",
    category: "parties",
  },
  {
    id: "pitch-virtual-money",
    headline: "חוזים את הבחירות —\nבכסף וירטואלי בלבד.",
    question: "האם יתקיים עימות טלוויזיוני בין המועמדים?",
    probability: 0.27,
    sample: true,
    seed: "debate",
    category: "media",
  },
  {
    id: "pitch-what-happens",
    headline: "מה באמת יקרה בבחירות?",
    question: "האם תקציב 2027 יאושר לפני סוף השנה?",
    probability: 0.55,
    sample: true,
    seed: "budget",
    category: "knesset",
  },
  {
    id: "pitch-beat-the-market",
    headline: "השוק אומר 63%.\nואתם?",
    question: "האם הכנסת ה-26 תושבע לפני סוף נובמבר?",
    probability: 0.63,
    sample: true,
    seed: "sworn",
    category: "knesset",
  },
];

function marketCreative(m: Market): Creative {
  return {
    id: m.slug.slice(0, 40),
    headline: "מה דעתכם?",
    question: m.title,
    probability: m.initialProbability,
    sample: false,
    seed: m.slug,
    category: m.category,
  };
}

/* ---------------- rendering ---------------- */

const RATIOS = [
  { id: "1.91x1", w: 1200, h: 628 },
  { id: "1x1", w: 1200, h: 1200 },
  { id: "4x5", w: 960, h: 1200 },
] as const;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The trend line on the card, drawn by the same generator the site's own chart
 * uses (`src/lib/synthetic-history.ts`). Reusing it rather than inventing a
 * squiggle means the curve moves the way a real LMSR market moves, and the same
 * creative redraws identically on every run.
 */
function chartPath(c: Creative, w: number, h: number): string {
  const history = buildDisplayHistory(
    {
      marketId: `ad-${c.seed}`,
      // the generator refuses to draw without a real price to pin to, by design.
      // The current probability is that anchor, exactly as on an untraded market.
      real: [{ t: CLOCK, p: c.probability }],
      probability: c.probability,
      closesAt: CLOCK + 45 * 86_400_000,
      status: "open",
      tradeCount: 0,
      now: CLOCK,
    },
    // A sample card quotes no real price, so it takes the module's widest legal
    // band — at the default ±3pt the line reads as flat at ad size. A card built
    // on a real market keeps the site's own settings, so the curve matches what
    // the site would draw for it.
    c.sample ? { ...DEFAULT_SYNTH_CONFIG, maxDeviation: SYNTH_HARD_MAX_DEVIATION } : DEFAULT_SYNTH_CONFIG,
  );
  // The site draws ~300 points across a scrollable chart. At ad size that reads
  // as noise, so thin it to a readable number of turns while keeping the ends.
  const all = history.points;
  if (all.length < 2) return "";
  const step = Math.max(1, Math.floor(all.length / CHART_POINTS));
  const pts = all.filter((_, i) => i % step === 0);
  if (pts[pts.length - 1] !== all[all.length - 1]) pts.push(all[all.length - 1]);
  const t0 = pts[0].t;
  const span = pts[pts.length - 1].t - t0 || 1;
  // a little headroom so the peak and trough are not flush with the box edges
  const lo = Math.min(...pts.map((p) => p.p)) - 0.012;
  const hi = Math.max(...pts.map((p) => p.p)) + 0.012;
  const range = hi - lo || 1;
  return pts
    .map((p, i) => {
      const x = ((p.t - t0) / span) * w;
      const y = h - ((p.p - lo) / range) * h;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** How many turns the trend line is allowed to show. */
const CHART_POINTS = 26;

/** Quantised clock, so two runs in the same hour produce byte-identical images. */
const CLOCK = Math.floor(Date.now() / 3_600_000) * 3_600_000;

/** Category chips, straight out of src/lib/categories.ts, so the ad matches the board. */
const CATEGORIES: Record<string, { label: string; accent: string }> = {
  polls: { label: "סקרים", accent: "#1d4ed8" },
  coalition: { label: "קואליציה וגושים", accent: "#5b21b6" },
  parties: { label: "מפלגות ופריימריז", accent: "#b45309" },
  legal: { label: "משפט ותביעות", accent: "#7e22ce" },
  media: { label: "תקשורת", accent: "#be185d" },
  security: { label: "ביטחון ומדיניות", accent: "#047857" },
  haredi: { label: "חרדים וגיוס", accent: "#a16207" },
  knesset: { label: "כנסת וחקיקה", accent: "#0e7490" },
  general: { label: "כללי", accent: "#576b8b" },
};

/**
 * The site's half-circle probability gauge (`src/components/ProbabilityGauge.tsx`),
 * at ad scale. Same geometry, same 6px stroke, same rule that the arc turns red
 * below 50%.
 */
function gauge(p: number, size: number): string {
  const r = size / 2 - size * 0.086;
  const cx = size / 2;
  const cy = size / 2 + size * 0.034;
  const circ = Math.PI * r;
  const fill = Math.max(0.02, Math.min(1, p)) * circ;
  const stroke = size * 0.103;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return `<svg width="${size}" height="${size / 2 + size * 0.1}" viewBox="0 0 ${size} ${size / 2 + size * 0.1}" aria-hidden="true">
      <path d="${arc}" fill="none" stroke="#dfe8f8" stroke-width="${stroke}" stroke-linecap="round"/>
      <path d="${arc}" fill="none" stroke="${p >= 0.5 ? YES : NO}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${fill} ${circ}"/>
    </svg>`;
}

/** The site's logo mark, read from public/ so the ad and the header never drift apart. */
const LOGO = readFileSync(path.join(ROOT, "public", "logo.svg"), "utf8").trim();

/* The site's own tokens (src/app/globals.css). */
const YES = "#15803d";
const NO = "#dc2626";
const TEXT_STRONG = "#0a1020";
const SURFACE_2 = "#f1f5fc";
const ACCENT_2 = "#1a3fae";
const MUTED = "#576b8b";
const BORDER = "#e3e9f4";

function html(c: Creative, w: number, h: number): string {
  // Scale everything off the short edge so one template serves all three ratios.
  const unit = Math.min(w, h) / 100;
  const yes = Math.round(c.probability * 100);
  const cat = CATEGORIES[c.category] ?? CATEGORIES.general;
  const chartW = 100;
  const chartH = 24;
  const d = chartPath(c, chartW, chartH);
  const wide = w / h > 1.5;
  const qSize = c.question.length > 46 ? 4.3 : c.question.length > 32 ? 4.9 : 5.5;
  const gaugeSize = unit * 15;
  const arcColor = c.probability >= 0.5 ? YES : NO;

  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  body{
    font-family:"Heebo","Noto Sans Hebrew","DejaVu Sans",system-ui,sans-serif;
    /* --color-surface-2: the site's own faint blue-cast surface. A white card on
       pure white would vanish into a Discover or Gmail feed, which is also white. */
    background:${SURFACE_2};
    color:${TEXT_STRONG};display:flex;flex-direction:column;justify-content:space-between;
    padding:${unit * 6}px ${unit * 6.5}px;
  }

  header{display:flex;align-items:center;gap:${unit * 2}px}
  header svg{width:${unit * 7}px;height:${unit * 7}px;border-radius:${unit * 1.8}px;flex:0 0 auto}
  .brand{font-size:${unit * 4.4}px;font-weight:900;letter-spacing:-.01em;color:${TEXT_STRONG}}
  .kicker{font-size:${unit * 2.9}px;font-weight:600;color:${MUTED}}

  .pitch{
    font-size:${unit * (c.headline.length > 34 ? 5.8 : 6.9)}px;font-weight:900;
    line-height:1.16;white-space:pre-line;letter-spacing:-.01em;color:${TEXT_STRONG};
  }

  /* --- .card, as the site draws it: white, hairline border, 14px radius --- */
  .card{
    background:#fff;color:${TEXT_STRONG};
    border:1px solid ${BORDER};border-radius:${unit * 2.6}px;
    padding:${unit * 3.4}px;
    display:flex;flex-direction:column;gap:${unit * 2.6}px;
    /* .card's own shadow, from globals.css */
    box-shadow:0 1px 2px rgba(10,16,32,.04), 0 ${unit * 1.2}px ${unit * 3}px -${unit * 1.4}px rgba(13,42,107,.18);
  }
  .top{display:flex;align-items:flex-start;gap:${unit * 2.4}px}
  .qcol{flex:1;min-width:0;display:flex;flex-direction:column;gap:${unit * 1.2}px}
  .chips{display:flex;align-items:center;gap:${unit * 1.4}px;flex-wrap:wrap}
  .chip{
    border-radius:${unit * 1}px;padding:${unit * 0.5}px ${unit * 1.3}px;
    font-size:${unit * 2.4}px;font-weight:600;
    background:${cat.accent}22;color:${cat.accent};
  }
  .team{font-size:${unit * 2.4}px;color:#8494ae;font-weight:500}
  .q{font-size:${unit * qSize}px;font-weight:700;line-height:1.24;color:${TEXT_STRONG}}
  .gauge{display:flex;flex-direction:column;align-items:center;flex:0 0 auto;width:${gaugeSize}px}
  .gnum{font-size:${unit * 4.2}px;font-weight:800;line-height:1;margin-top:${unit * 0.2}px;color:${TEXT_STRONG}}
  .glabel{font-size:${unit * 2.1}px;color:${MUTED}}

  .chart{display:block;width:100%;height:${unit * (wide ? 11 : 15)}px}

  .btns{display:grid;grid-template-columns:1fr 1fr;gap:${unit * 1.6}px}
  .btn{
    border-radius:${unit * 1.5}px;padding:${unit * 2}px 0;text-align:center;
    font-size:${unit * 3.4}px;font-weight:700;
  }
  /* bg-yes/15 and bg-no/15, exactly as the market card renders them */
  .yes{background:rgba(21,128,61,.15);color:${YES}}
  .no{background:rgba(220,38,38,.15);color:${NO}}

  .meta{font-size:${unit * 2.4}px;color:${MUTED}}

  footer{
    display:flex;gap:${unit * 1.2}px;
    ${wide ? "align-items:center;justify-content:space-between;" : "flex-direction:column;align-items:flex-start;"}
  }
  .tag{font-size:${unit * 3}px;font-weight:800;color:${ACCENT_2}}
  .disclosure{font-size:${unit * 2.7}px;font-weight:500;color:${MUTED}}
</style></head>
<body>
  <header>
    ${LOGO}
    <span class="brand">בחירות מרקט</span>
    <span class="kicker">הבחירות והפוליטיקה הישראלית</span>
  </header>

  <h1 class="pitch">${esc(c.headline)}</h1>

  <div class="card">
    <div class="top">
      <div class="qcol">
        <div class="chips">
          <span class="chip">${esc(cat.label)}</span>
          <span class="team">${c.sample ? "דוגמה" : "צוות המערכת"}</span>
        </div>
        <span class="q">${esc(c.question)}</span>
      </div>
      <div class="gauge">
        ${gauge(c.probability, gaugeSize)}
        <div class="gnum">${yes}%</div>
        <div class="glabel">סיכוי</div>
      </div>
    </div>

    <svg class="chart" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${arcColor}" stop-opacity=".16"/>
          <stop offset="100%" stop-color="${arcColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${d} L${chartW},${chartH} L0,${chartH} Z" fill="url(#fade)"/>
      <path d="${d}" fill="none" stroke="${arcColor}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>

    <div class="btns">
      <span class="btn yes">כן ${yes}%</span>
      <span class="btn no">לא ${100 - yes}%</span>
    </div>

    <div class="meta">
      <span>נסגר בעוד 45 ימים</span>
    </div>
  </div>

  <footer>
    <span class="tag">לקראת הבחירות לכנסת ה-26</span>
    <span class="disclosure">כסף וירטואלי בלבד · ללא הימורים</span>
  </footer>
</body></html>`;
}

/* ---------------- text assets ---------------- */

/** Demand Gen's hard character limits. Anything over is rejected on paste. */
const LIMITS = { headline: 40, longHeadline: 90, description: 90, businessName: 25 };

const TEXT = {
  generic: {
    headlines: [
      "אתם מכירים את העם שלכם?",
      "שוק חיזויים על הבחירות",
      "מה באמת יקרה בבחירות?",
      "השתתפות חינם. בלי אשראי.",
      "₪10,000 וירטואליים במתנה",
    ],
    longHeadline: "שוק חיזויים על הבחירות והפוליטיקה הישראלית — בכסף וירטואלי בלבד",
    descriptions: [
      "עונים כן או לא על מה שיקרה בבחירות, ורואים אם קראתם את המפה נכון.",
      "כסף וירטואלי בלבד. בלי הימורים, בלי תשלום, בלי אשראי.",
      "מקבלים ₪10,000 וירטואליים ומתחילים לחזות. השתתפות חינם.",
      "השאלות מתעדכנות כל שעה לפי החדשות, לקראת הבחירות לכנסת ה-26.",
      "לוח מובילים, תיק אישי וגרפים. הכל בכסף וירטואלי.",
    ],
  },
  named: {
    headlines: [
      "מה הסיכוי שזה יקרה?",
      "השוק נותן 63%. ואתם?",
      "חוזים את בחירות 2026",
      "₪10,000 וירטואליים במתנה",
      "כן או לא. 30 שאלות, 3 דקות",
    ],
    longHeadline: "שוק החיזויים של בחירות 2026 — בכסף וירטואלי בלבד",
    descriptions: [
      "סקרים, קואליציה ומנדטים. קנו ״כן״ או ״לא״ וראו אם צדקתם.",
      "כסף וירטואלי בלבד. בלי הימורים, בלי תשלום, בלי אשראי.",
      "השאלות נכתבות ומוכרעות כל שעה לפי החדשות.",
      "מקבלים ₪10,000 וירטואליים ומתחילים לחזות. חינם.",
      "לוח מובילים, תיק אישי וגרפים. הכל בכסף וירטואלי.",
    ],
  },
} as const;

function copyMd(set: "generic" | "named", used: Creative[]): string {
  const t = TEXT[set];
  const row = (s: string, max: number) => `| ${s} | ${[...s].length}/${max} | ${[...s].length <= max ? "✅" : "❌ ארוך מדי"} |`;
  return `# נכסי טקסט ל-Demand Gen — סט \`${set}\`

${
  set === "named"
    ? "> ⚠️ הסט הזה מזכיר פוליטיקאים ומפלגות. הוא דורש **אימות מפרסם לתעמולת בחירות** בחשבון Google Ads לפני שאפשר להריץ אותו."
    : "> הסט הזה לא מזכיר אף פוליטיקאי ואף מפלגה, ולכן אינו אמור להיחשב תעמולת בחירות."
}

## כותרות (Headlines) — עד ${LIMITS.headline} תווים

| טקסט | אורך | תקין |
|---|---|---|
${t.headlines.map((h) => row(h, LIMITS.headline)).join("\n")}

## כותרת ארוכה (Long headline) — עד ${LIMITS.longHeadline} תווים

| טקסט | אורך | תקין |
|---|---|---|
${row(t.longHeadline, LIMITS.longHeadline)}

## תיאורים (Descriptions) — עד ${LIMITS.description} תווים

| טקסט | אורך | תקין |
|---|---|---|
${t.descriptions.map((d) => row(d, LIMITS.description)).join("\n")}

## שם העסק — עד ${LIMITS.businessName} תווים

${row("בחירות מרקט", LIMITS.businessName)}

## כתובת היעד (Final URL)

\`\`\`
https://<הדומיין>/welcome?utm_source=google&utm_medium=demandgen&utm_campaign=${set}
\`\`\`

## התמונות בתיקייה

${used.map((c) => `- \`${c.id}\` — ${c.question}${c.sample ? " *(שאלת דוגמה)*" : ""}`).join("\n")}
`;
}

/* ---------------- main ---------------- */

const args = process.argv.slice(2);
const set = (args.find((a) => a.startsWith("--set="))?.split("=")[1] ?? "generic") as "generic" | "named";
const wantPng = args.includes("--png");
if (set !== "generic" && set !== "named") throw new Error(`--set must be generic or named, got ${set}`);

// `generic` runs on written sample questions plus any real market whose *title*
// names nobody — the people[] tags are metadata and never reach the image.
const creatives: Creative[] =
  set === "named"
    ? pickMarkets(false, 6).map(marketCreative)
    : [...SAMPLE_CREATIVES, ...pickMarkets(true, 2).map(marketCreative)];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const files: string[] = [];
for (const c of creatives) {
  for (const r of RATIOS) {
    const file = path.join(OUT, `${c.id}--${r.id}.html`);
    writeFileSync(file, html(c, r.w, r.h), "utf8");
    files.push(file);
  }
}
writeFileSync(path.join(OUT, "copy.md"), copyMd(set, creatives), "utf8");

console.log(`✅ ${creatives.length} קריאייטיבים × ${RATIOS.length} יחסים = ${files.length} קבצי HTML`);
console.log(`   ${path.relative(ROOT, OUT)}/`);

if (!wantPng) {
  console.log(`\nלהמרה ל-PNG (מה שגוגל מקבלת): npm run ads:creatives -- --set=${set} --png`);
  process.exit(0);
}

/* ---------------- rasterise ---------------- */

function findChrome(): string | null {
  const explicit = process.env.CHROME_BIN;
  if (explicit && existsSync(explicit)) return explicit;
  const candidates = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/**
 * Headless Chrome sizes the *window*, not the viewport, so the browser frame is
 * silently subtracted and the bottom of every creative gets cropped. The gap is
 * build-specific (87px here, 0 on some platforms), so measure it once rather
 * than hard-coding a number that is wrong on the next machine.
 */
function frameHeight(chrome: string): number {
  const probe = path.join(OUT, ".probe.html");
  writeFileSync(probe, `<html><body><script>document.body.textContent="H"+innerHeight+"H"</script></body></html>`, "utf8");
  try {
    const out = execFileSync(
      chrome,
      [...baseFlags, "--window-size=800,1000", "--dump-dom", `file://${probe}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const inner = Number(/H(\d+)H/.exec(out)?.[1]);
    return Number.isFinite(inner) && inner > 0 && inner <= 1000 ? 1000 - inner : 0;
  } catch {
    return 0;
  } finally {
    rmSync(probe, { force: true });
  }
}

const baseFlags = [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  // Chrome refuses to sandbox itself when uid 0 owns the process (CI, containers)
  ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
];

const chrome = findChrome();
if (!chrome) {
  console.error(
    "\n⚠️  לא נמצא Chrome/Chromium. הגדירו CHROME_BIN=<נתיב> והריצו שוב,\n" +
      "   או פתחו כל קובץ HTML בדפדפן וצלמו אותו בגודל המדויק שמופיע בשם הקובץ.",
  );
  process.exit(1);
}

/* --- PNG bottom crop ---------------------------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Trims the blank strip headless Chrome leaves below the viewport.
 *
 * PNG scanlines are filtered against the line above them, so keeping a prefix
 * of the rows needs no unfiltering — every kept line still has the line it
 * refers to. Anything unexpected (a palette, 16-bit samples, interlacing) is
 * left alone rather than corrupted.
 */
function cropPngBottom(file: string, height: number): boolean {
  const png = readFileSync(file);
  let pos = 8;
  let ihdr: { start: number; data: Buffer } | null = null;
  const idat: Buffer[] = [];
  const tail: Buffer[] = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.subarray(pos + 4, pos + 8).toString("ascii");
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") ihdr = { start: pos, data: Buffer.from(data) };
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type !== "IEND") tail.push(png.subarray(pos, pos + 12 + len));
    pos += 12 + len;
  }
  if (!ihdr) return false;

  const w = ihdr.data.readUInt32BE(0);
  const h = ihdr.data.readUInt32BE(4);
  const [depth, colorType, , , interlace] = [ihdr.data[8], ihdr.data[9], ihdr.data[10], ihdr.data[11], ihdr.data[12]];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (depth !== 8 || !channels || interlace !== 0 || height >= h) return false;

  const stride = 1 + w * channels;
  const raw = inflateSync(Buffer.concat(idat)).subarray(0, stride * height);
  ihdr.data.writeUInt32BE(height, 4);
  writeFileSync(
    file,
    Buffer.concat([
      png.subarray(0, 8),
      chunk("IHDR", ihdr.data),
      ...tail,
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
  return true;
}

const frame = frameHeight(chrome);
let cropped = 0;
for (const file of files) {
  const [, ratio] = path.basename(file, ".html").split("--");
  const r = RATIOS.find((x) => x.id === ratio)!;
  const png = file.replace(/\.html$/, ".png");
  execFileSync(
    chrome,
    [
      ...baseFlags,
      // give the webfont a moment to arrive, or the Hebrew falls back to a system face
      "--virtual-time-budget=4000",
      `--window-size=${r.w},${r.h + frame}`,
      `--screenshot=${png}`,
      `file://${file}`,
    ],
    { stdio: "pipe" },
  );
  if (frame > 0 && cropPngBottom(png, r.h)) cropped++;
}
console.log(`🖼️  ${files.length} קבצי PNG נוצרו לצד ה-HTML`);
if (frame > 0 && cropped < files.length) {
  console.warn(`⚠️  ${files.length - cropped} תמונות נשארו בגובה ${"" + frame}px עודף — בדקו את המידות לפני ההעלאה`);
}
