/**
 * Generates the image and text assets a Google Ads Demand Gen campaign needs,
 * from the questions actually on the board.
 *
 * Two sets, because Google treats them differently:
 *
 *   --set=generic (default)  Brand creatives plus any question that names no
 *                            politician and no party. These do not read as
 *                            election ads, so they can run without Google's
 *                            Israel election-advertiser verification.
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

/** True when nothing in the text could make Google read the ad as election advertising. */
function isNameFree(m: Market): boolean {
  if (m.people?.length) return false;
  const text = `${m.title} ${m.subtitle ?? ""}`;
  return !NAME_WORDS.some((w) => text.includes(w));
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
  /** Small line above the headline. */
  eyebrow: string;
  headline: string;
  /** Big number shown as a probability dial, when the creative is built on a real market. */
  probability?: number;
  footer: string;
}

const BRAND_CREATIVES: Creative[] = [
  {
    id: "brand-10k",
    eyebrow: "משחק חיזויים חינם",
    headline: "₪10,000 וירטואליים.\nכמה טוב אתם קוראים את הפוליטיקה?",
    footer: "כסף וירטואלי בלבד · ללא הימורים",
  },
  {
    id: "brand-hourly",
    eyebrow: "שאלות חדשות כל שעה",
    headline: "החדשות של הבוקר\nהופכות לשאלה עד הצהריים.",
    footer: "כסף וירטואלי בלבד · ללא הימורים",
  },
  {
    id: "brand-vs",
    eyebrow: "אתם מול השוק",
    headline: "השוק נותן לזה 63%.\nאתם חושבים אחרת?",
    probability: 0.63,
    footer: "כסף וירטואלי בלבד · ללא הימורים",
  },
  {
    id: "brand-rapid",
    eyebrow: "מצב זריז",
    headline: "כן או לא.\n30 שאלות בשלוש דקות.",
    footer: "כסף וירטואלי בלבד · ללא הימורים",
  },
];

function marketCreative(m: Market): Creative {
  return {
    id: m.slug.slice(0, 40),
    eyebrow: "מה דעתכם?",
    headline: m.title,
    probability: m.initialProbability,
    footer: "כסף וירטואלי בלבד · ללא הימורים",
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

function html(c: Creative, w: number, h: number): string {
  // Scale everything off the short edge so one template serves all three ratios.
  const unit = Math.min(w, h) / 100;
  const dial = c.probability !== undefined;
  const pct = dial ? Math.round(c.probability! * 100) : 0;
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  body{
    font-family:"Heebo","Noto Sans Hebrew","DejaVu Sans",system-ui,sans-serif;
    background:linear-gradient(135deg,#0a1020 0%,#0d2a6b 45%,#1d4ed8 100%);
    color:#fff;display:flex;flex-direction:column;justify-content:space-between;
    padding:${unit * 8}px ${unit * 8}px;
  }
  .eyebrow{
    display:inline-block;align-self:flex-start;background:rgba(255,255,255,.16);
    border-radius:999px;padding:${unit * 1.6}px ${unit * 3.4}px;
    font-size:${unit * 3.4}px;font-weight:800;letter-spacing:.01em;
  }
  main{display:flex;align-items:center;gap:${unit * 5}px;flex:1;padding:${unit * 4}px 0}
  h1{
    font-size:${unit * (c.headline.length > 70 ? 6.4 : c.headline.length > 45 ? 7.6 : 9)}px;
    font-weight:900;line-height:1.18;white-space:pre-line;flex:1;
    text-wrap:balance;
  }
  .dial{
    flex:0 0 auto;width:${unit * 26}px;height:${unit * 26}px;border-radius:50%;
    background:conic-gradient(#4ade80 0 ${pct}%,rgba(255,255,255,.18) ${pct}% 100%);
    display:grid;place-items:center;
  }
  .dial > div{
    width:78%;height:78%;border-radius:50%;background:#0a1020;
    display:grid;place-items:center;font-size:${unit * 7}px;font-weight:900;
  }
  footer{display:flex;align-items:center;justify-content:space-between;gap:${unit * 3}px}
  .brand{font-size:${unit * 4.4}px;font-weight:900}
  .disclosure{font-size:${unit * 3}px;font-weight:500;color:rgba(255,255,255,.72);text-align:left}
</style></head>
<body>
  <span class="eyebrow">${esc(c.eyebrow)}</span>
  <main>
    <h1>${esc(c.headline)}</h1>
    ${dial ? `<div class="dial"><div>${pct}%</div></div>` : ""}
  </main>
  <footer>
    <span class="brand">בחירות מרקט</span>
    <span class="disclosure">${esc(c.footer)}</span>
  </footer>
</body></html>`;
}

/* ---------------- text assets ---------------- */

/** Demand Gen's hard character limits. Anything over is rejected on paste. */
const LIMITS = { headline: 40, longHeadline: 90, description: 90, businessName: 25 };

const TEXT = {
  generic: {
    headlines: [
      "משחק חיזויים על הפוליטיקה",
      "₪10,000 וירטואליים במתנה",
      "אתם קוראים את המפה נכון?",
      "כן או לא. 30 שאלות, 3 דקות",
      "שאלות חדשות כל שעה",
    ],
    longHeadline: "משחק חיזויים חינמי על הפוליטיקה הישראלית — בכסף וירטואלי בלבד",
    descriptions: [
      "מקבלים ₪10,000 וירטואליים, עונים כן או לא, ורואים אם צדקתם.",
      "כסף וירטואלי בלבד. בלי הימורים, בלי תשלום, בלי אשראי.",
      "השאלות מתעדכנות כל שעה לפי החדשות. ההרשמה בלחיצה אחת.",
      "כמה טוב אתם קוראים את הפוליטיקה הישראלית? בואו נגלה.",
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

${used.map((c) => `- \`${c.id}\` — ${c.headline.replace(/\n/g, " ")}`).join("\n")}
`;
}

/* ---------------- main ---------------- */

const args = process.argv.slice(2);
const set = (args.find((a) => a.startsWith("--set="))?.split("=")[1] ?? "generic") as "generic" | "named";
const wantPng = args.includes("--png");
if (set !== "generic" && set !== "named") throw new Error(`--set must be generic or named, got ${set}`);

const creatives: Creative[] =
  set === "named"
    ? pickMarkets(false, 6).map(marketCreative)
    : [...BRAND_CREATIVES, ...pickMarkets(true, 3).map(marketCreative)];

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
