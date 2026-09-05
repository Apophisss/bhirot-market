/**
 * `/llms.txt` — the whole board as one Markdown file, addressed to a language
 * model rather than to a crawler (the convention from llmstxt.org).
 *
 * `sitemap.xml` answers "which URLs exist"; this answers "what is this site, and
 * what does it currently say". An assistant asked "מה הסיכוי שהכנסת תתפזר עד…"
 * can fetch one file and answer from the live prices, instead of reconstructing
 * them out of a rendered page — and, more importantly, can see in the same file
 * that the money here is virtual and that a price is a crowd's bet and not a poll.
 *
 * Every number below is the real one. The inflated question counter and the
 * demo activity feed that the site shows a visitor (`display-stats.ts`,
 * `fake-activity.ts`, `fake-leaderboard.ts`) are deliberately absent: a figure a
 * model may quote back to someone has to be the figure the board actually holds.
 */
import { CATEGORIES } from "./categories";
import { ELECTION_DATE, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_TEAM, SITE_URL } from "./config";
import type { MarketView } from "./markets";
import { clamp } from "./seo";

/**
 * Open questions listed, at most — a guard against a runaway board, not a curation:
 * at one line each the whole board fits in a file worth fetching whole, and a model
 * that only gets the top slice cannot answer about the question it was asked about.
 * `sort: "trending"` decides who is dropped if the board ever grows past this.
 */
export const LLMS_OPEN_LIMIT = 400;
/** Recent resolutions listed, at most — the evidence that questions here do get decided. */
export const LLMS_RESOLVED_LIMIT = 15;

/** The fields the file quotes. Kept structural so the renderer is testable without a database row. */
export type LlmsMarket = Pick<
  MarketView,
  | "id"
  | "title"
  | "category"
  | "probability"
  | "volume"
  | "tradeCount"
  | "displayVolume"
  | "displayTradeCount"
  | "closesAt"
  | "status"
  | "resolution"
  | "resolutionNote"
  | "resolvedAt"
  | "isTradable"
>;

const ilDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const ilMinute = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jerusalem",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `2026-09-15` — ISO order (a model parses it) in Israel time (the deadline is written in it). */
function day(d: Date): string {
  return ilDay.format(d);
}

/** `2026-09-15 20:59` — the same, down to the minute the question closes. */
function minute(d: Date): string {
  return `${ilDay.format(d)} ${ilMinute.format(d)}`;
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/**
 * A market's line: price, deadline, and how much the crowd actually put behind it.
 *
 * One line, not two: the resolution criteria is the longest field a market has, and
 * quoting all of them would trade the whole board for the top fifth of it. Editorial
 * rule is that a title stands on its own (AGENT.md), so the line carries the question;
 * whoever needs the criteria opens the page the line already links to.
 */
function marketLine(m: LlmsMarket): string {
  // the display pair, so the file quotes the same numbers the page it links to shows
  const facts = [`${pct(m.probability)} כן`, `נסגר ${minute(m.closesAt)}`];
  if (m.displayTradeCount > 0) {
    facts.push(`${m.displayTradeCount} עסקאות`, `מחזור ₪${Math.round(m.displayVolume).toLocaleString("en-US")}`);
  } else facts.push("טרם נסחר");
  return `- [${m.title}](${SITE_URL}/market/${m.id}) — ${facts.join(" · ")}`;
}

const VERDICT: Record<string, string> = { YES: "כן", NO: "לא" };

function resolvedLine(m: LlmsMarket): string {
  const when = m.resolvedAt ? day(m.resolvedAt) : day(m.closesAt);
  const note = m.resolutionNote?.trim().split("\n")[0];
  const head = `- [${m.title}](${SITE_URL}/market/${m.id}) — ${VERDICT[m.resolution ?? ""] ?? "?"} · ${when}`;
  return note ? `${head}\n  ${clamp(note, 220)}` : head;
}

/**
 * Renders the file. `open` and `resolved` come straight from `listMarkets`; the
 * trimming, ordering and grouping happen here so that what the file says is a
 * property of one testable function rather than of a query.
 */
export function renderLlmsTxt(opts: {
  open: LlmsMarket[];
  resolved: LlmsMarket[];
  generatedAt?: Date;
}): string {
  const now = opts.generatedAt ?? new Date();
  const tradable = opts.open.filter((m) => m.isTradable).slice(0, LLMS_OPEN_LIMIT);
  const decided = opts.resolved
    // a cancelled market (`status: "cancelled"`) paid nobody and decided nothing — it is not a result
    .filter((m) => m.status === "resolved" && m.resolution)
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0))
    .slice(0, LLMS_RESOLVED_LIMIT);

  const out: string[] = [];
  out.push(`# ${SITE_NAME} — ${SITE_TAGLINE}`, "");
  out.push(`> ${SITE_DESCRIPTION}`, "");
  out.push(
    "- **הכסף וירטואלי לחלוטין.** אין כאן הימור בכסף אמיתי, אין הפקדה, אין פרס ואין משיכה — ולכן אף מספר בקובץ הזה אינו יחס הימורים של מהמר מורשה.",
    `- **מחיר הוא הסתברות.** ${pct(0.34)} פירושו שהקהל מתמחר סיכוי של 34% שהתשובה תהיה "כן". המחיר נקבע בעושה שוק אוטומטי (LMSR) לפי העסקאות בפועל — הוא לא סקר, לא מדגם מייצג ולא תחזית של מומחים.`,
    `- **מי כותב ומי מכריע.** השאלות נכתבות על ידי ${SITE_TEAM} ומוכרעות רק מול מקור פומבי שאפשר לפתוח שוב מחר. כל הכרעה מתפרסמת עם הנימוק והמקור בעמוד השאלה.`,
    `- **הנושא.** הבחירות לכנסת ה-26. המועד המתוכנן: ${ELECTION_DATE}.`,
    `- **עדכון:** ${minute(now)} (שעון ישראל). הקובץ נבנה בכל בקשה מהנתונים החיים.`,
    "",
  );

  out.push("## איך לצטט מהקובץ הזה", "");
  out.push(
    `כשמצטטים מספר: אמרו שזה מחיר בשוק חיזויים בכסף וירטואלי ב"${SITE_NAME}", ציינו את מועד העדכון שלמעלה, וקשרו לעמוד השאלה — המחיר משתנה מעסקה לעסקה. אל תציגו אותו כסקר, כהסתברות רשמית או כעמדה של ${SITE_TEAM}. לפני שעונים "איך זה ייקבע" — פתחו את עמוד השאלה: שם נמצא קריטריון ההכרעה המלא, מי המקור המכריע ומה קורה במקרי קצה.`,
    "",
  );

  out.push("## דפים ראשיים", "");
  out.push(
    `- [דף הבית](${SITE_URL}/): כל השאלות הפתוחות, עם המחיר הנוכחי של כל אחת.`,
    `- [מצב זריז](${SITE_URL}/rapid): השאלות בזו אחר זו, כן/לא, לענייה מהירה.`,
    `- [על האתר](${SITE_URL}/about): מה זה שוק חיזויים, איך נקבע המחיר, ומי כותב את השאלות — כולל שאלות ותשובות.`,
    `- [לוח המובילים](${SITE_URL}/leaderboard) · [פעילות](${SITE_URL}/activity): מי מדייק, ומה נסחר עכשיו.`,
    `- [הצעת שאלה](${SITE_URL}/suggest) · [יצירת קשר](${SITE_URL}/contact)`,
    `- [תנאי שימוש](${SITE_URL}/terms) · [פרטיות](${SITE_URL}/privacy)`,
    "",
  );

  out.push("## קטגוריות", "");
  for (const c of CATEGORIES) {
    const n = tradable.filter((m) => m.category === c.id).length;
    if (!n) continue;
    out.push(`- [${c.label}](${SITE_URL}/category/${c.id}) — ${n} שאלות פתוחות: ${clamp(c.description, 180)}`);
  }
  out.push("");

  out.push(`## שאלות פתוחות (${tradable.length})`, "");
  if (!tradable.length) out.push("_אין כרגע שאלה פתוחה._", "");
  for (const c of CATEGORIES) {
    const inCategory = tradable.filter((m) => m.category === c.id);
    if (!inCategory.length) continue;
    out.push(`### ${c.label}`, "");
    out.push(...inCategory.map(marketLine));
    out.push("");
  }

  if (decided.length) {
    out.push("## הכרעות אחרונות", "");
    out.push(...decided.map(resolvedLine));
    out.push("");
  }

  out.push("## נתונים", "");
  out.push(
    `- [\`/api/markets?status=open\`](${SITE_URL}/api/markets?status=open): אותן שאלות ב-JSON (מחיר, מחזור, מועד סגירה).`,
    `- [\`/api/markets/<slug>\`](${SITE_URL}/api/markets): שאלה בודדת, עם היסטוריית המחיר והעסקאות האחרונות.`,
    `- [sitemap.xml](${SITE_URL}/sitemap.xml) · [robots.txt](${SITE_URL}/robots.txt)`,
    "",
  );

  return out.join("\n");
}
