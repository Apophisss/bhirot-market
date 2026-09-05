import { CATEGORIES } from "./categories";
import { SITE_NAME, SITE_TAGLINE, SITE_URL, ELECTION_DATE } from "./config";
import { CLICK_IDS, EVENT_LABELS } from "./events";
import { analyticsSize, RETENTION_DAYS } from "./analytics";
import {
  getAgentRuns,
  getCalibration,
  getCampaigns,
  getCategoryMetrics,
  getClickTotals,
  getClientErrors,
  getContentHealth,
  getCountrySplit,
  getDailyBusiness,
  getDailyTraffic,
  getDeviceSplit,
  getEventTotals,
  getFunnel,
  getHourHistogram,
  getIssues,
  getMarketMetrics,
  getRetention,
  getSearchTerms,
  getSlowPages,
  getTopPages,
  getTopReferrers,
  getTraffic,
  getTradingStats,
  getUserStats,
  getWebVitals,
  range,
  TZ_NAME,
} from "./stats";

export const BUNDLE_VERSION = 1;

/** What the analysis agent gets told about the site before it looks at a single number. */
function guide(days: number) {
  return {
    what: `חבילת נתונים מלאה של ${SITE_NAME} — ${SITE_TAGLINE}. כל המספרים מחושבים על ${days} הימים האחרונים, אלא אם כתוב אחרת.`,
    howToUse: [
      "התחילו מ-issues: זו רשימת הבעיות שהאתר זיהה על עצמו, ממוינת לפי חומרה, עם רמז לאיפה בקוד לתקן.",
      "אחר כך funnel: איפה נופלים המשתמשים בין כניסה לאתר לבין עסקה ראשונה.",
      "markets.byMarket מראה אילו שאלות מושכות צפיות אך לא עסקאות — זה בדרך כלל בעיה בניסוח השאלה או בתמחור.",
      "performance מכיל Core Web Vitals אמיתיים מהשדה; מעל 2500ms ב-LCP p75 שווה עבודה.",
      "הציעו שינויים קונקרטיים בקבצים שמופיעים ב-repoMap, והסבירו כל שינוי במונחי המדד שהוא אמור להזיז.",
    ],
    metricsGlossary: {
      visitors: "דפדפן ייחודי ביום. מבוסס על hash מתחלף של IP+User-Agent — אין קוקי ואין זיהוי חוצה-ימים.",
      sessions: "ביקור בטאב אחד (sessionStorage).",
      bounceRate: "אחוז הסשנים עם צפייה בעמוד אחד בלבד.",
      conversion: "בשוק: סוחרים ייחודיים חלקי מבקרים ייחודיים בעמוד השוק.",
      brierInitial:
        "ציון בְּרַייר של המחיר ההתחלתי של שאלות שהוכרעו (0 = חיזוי מושלם, 0.25 = מטבע). מודד עד כמה המחיר הפותח של צוות המערכת מדויק.",
      brierFinal: "ציון ברייר של המחיר האחרון לפני ההכרעה — מודד את חוכמת ההמון באתר.",
      overdue: "שווקים שעבר מועד הסגירה שלהם ועדיין לא הוכרעו.",
      lmsr: "מנגנון התמחור: Logarithmic Market Scoring Rule עם פרמטר נזילות b לכל שוק (src/lib/lmsr.ts).",
    },
    eventCatalog: EVENT_LABELS,
    clickIds: CLICK_IDS,
    repoMap: {
      "עמוד הבית ורשימת השווקים": "src/app/page.tsx, src/components/MarketCard.tsx, src/components/CategoryTabs.tsx",
      "עמוד שוק ופאנל המסחר": "src/app/market/[slug]/page.tsx, src/components/TradePanel.tsx",
      "מנוע התמחור והעסקאות": "src/lib/lmsr.ts, src/lib/trade.ts",
      "התחברות והרשמה": "src/app/login/page.tsx, src/lib/auth.ts",
      "מעקב ואנליטיקה": "src/components/Analytics.tsx, src/lib/track.ts, src/lib/analytics.ts, src/lib/stats.ts",
      "עמוד הניהול": "src/app/admin/**, src/lib/admin.ts",
      "כללי כתיבת השאלות (הרוטינה השעתית)": "AGENT.md, src/lib/agent/prompt.ts, data/markets.json",
      "סכימת מסד הנתונים": "src/lib/db/schema.ts, drizzle/",
    },
    suggestedQuestions: [
      "מה השינוי הבודד שיעלה הכי הרבה את מספר המשתמשים שמבצעים עסקה ראשונה?",
      "אילו קטגוריות שאלות מייצרות הכי הרבה עסקאות ליחידת צפייה, ומה זה אומר על מה שהרוטינה צריכה לכתוב?",
      "האם יש עמודים איטיים או שגיאות דפדפן שפוגעות בהמרה?",
      "האם המחירים הפותחים של השאלות מכוילים (brierInitial), או שיש הטיה שיטתית?",
      "מה כדאי להוריד מהאתר — מה שאף אחד לא נוגע בו?",
    ],
    privacy:
      "החבילה לא כוללת שמות, אימיילים, כתובות IP או מזהי משתמש. כל נתוני המשתמשים כאן הם צבירים בלבד.",
  };
}

export interface BundleOptions {
  days?: number;
  /** how many markets to include, most-engaging first */
  markets?: number;
}

export async function buildBundle(opts: BundleOptions = {}) {
  const days = Math.max(1, Math.min(opts.days ?? 90, 365));
  const r = range(days);
  const marketLimit = Math.max(10, Math.min(opts.markets ?? 300, 1000));

  const [
    traffic,
    dailyTraffic,
    dailyBusiness,
    pages,
    referrers,
    campaigns,
    devices,
    countries,
    events,
    clicks,
    searches,
    funnel,
    markets,
    categories,
    calibration,
    contentHealth,
    users,
    cohorts,
    trading,
    hours,
    vitals,
    slowPages,
    errors,
    agentRuns,
    issues,
    size,
  ] = await Promise.all([
    getTraffic(r),
    getDailyTraffic(r),
    getDailyBusiness(r),
    getTopPages(r, 40),
    getTopReferrers(r, 25),
    getCampaigns(r, 25),
    getDeviceSplit(r),
    getCountrySplit(r, 15),
    getEventTotals(r),
    getClickTotals(r, 40),
    getSearchTerms(r, 40),
    getFunnel(r),
    getMarketMetrics(r, { limit: marketLimit }),
    getCategoryMetrics(r),
    getCalibration(),
    getContentHealth(),
    getUserStats(r),
    getRetention(12),
    getTradingStats(r),
    getHourHistogram(r),
    getWebVitals(r),
    getSlowPages(r, 15),
    getClientErrors(r, 25),
    getAgentRuns(30),
    getIssues(r),
    analyticsSize(),
  ]);

  return {
    meta: {
      bundleVersion: BUNDLE_VERSION,
      generatedAt: new Date().toISOString(),
      rangeDays: days,
      rangeFrom: new Date(r.from).toISOString(),
      rangeTo: new Date(r.to).toISOString(),
      timezone: TZ_NAME,
      site: { name: SITE_NAME, tagline: SITE_TAGLINE, url: SITE_URL, electionDate: ELECTION_DATE },
      analytics: {
        storedEvents: size.events,
        oldestEvent: size.oldest?.toISOString() ?? null,
        retentionDays: RETENTION_DAYS,
        collector: "/api/analytics/collect",
      },
      categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    },
    guide: guide(days),
    issues,
    summary: {
      visitors: traffic.current.visitors,
      visitorsPrev: traffic.previous.visitors,
      pageviews: traffic.current.pageviews,
      pageviewsPrev: traffic.previous.pageviews,
      sessions: traffic.current.sessions,
      bounceRate: traffic.current.bounceRate,
      pagesPerSession: traffic.current.pagesPerSession,
      avgSecondsOnPage: traffic.current.avgSecondsOnPage,
      users: users.total,
      newUsers: users.newInRange,
      activeTraders: users.activeTraders,
      trades: trading.trades,
      volume: trading.volume,
      openMarkets: contentHealth.open,
      resolvedMarkets: contentHealth.resolved,
    },
    funnel,
    traffic: {
      daily: dailyTraffic,
      pages,
      referrers,
      campaigns,
      devices,
      countries,
      hourOfDay: hours,
    },
    engagement: { events, clicks, searches },
    business: { daily: dailyBusiness, trading },
    markets: { health: contentHealth, calibration, byCategory: categories, byMarket: markets },
    users: { stats: users, cohorts },
    performance: { webVitals: vitals, slowPages, clientErrors: errors },
    editorial: { agentRuns },
  };
}

export type Bundle = Awaited<ReturnType<typeof buildBundle>>;

/* ------------------------------ markdown ------------------------------- */

const nf = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
const n = (v: number | null | undefined) => nf.format(Number(v ?? 0));
const p = (v: number | null | undefined) => `${nf.format(Number(v ?? 0) * 100)}%`;

function table(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

/** A readable digest of the same data — handy to paste straight into a chat. */
export function bundleToMarkdown(b: Bundle): string {
  const s = b.summary;
  const out: string[] = [];
  out.push(`# ${b.meta.site.name} — דוח נתונים`, "");
  out.push(
    `נוצר: ${b.meta.generatedAt} · טווח: ${b.meta.rangeDays} ימים · אזור זמן: ${b.meta.timezone} · גרסת חבילה: ${b.meta.bundleVersion}`,
    "",
    b.guide.privacy,
    "",
  );

  out.push("## מה לבדוק קודם", "");
  out.push(...b.guide.howToUse.map((l) => `- ${l}`), "");

  out.push("## בעיות שזוהו", "");
  if (!b.issues.length) out.push("_לא נמצאו בעיות בטווח הזה._", "");
  else {
    out.push(
      table(
        ["חומרה", "בעיה", "פירוט", "איפה לתקן"],
        b.issues.map((i) => [i.severity, i.title, i.detail, `\`${i.hint}\``]),
      ),
      "",
    );
  }

  out.push("## מספרים ראשיים", "");
  out.push(
    table(
      ["מדד", "ערך", "תקופה קודמת"],
      [
        ["מבקרים", n(s.visitors), n(s.visitorsPrev)],
        ["צפיות בעמודים", n(s.pageviews), n(s.pageviewsPrev)],
        ["סשנים", n(s.sessions), "—"],
        ["נטישה", p(s.bounceRate), "—"],
        ["עמודים לסשן", n(s.pagesPerSession), "—"],
        ["שניות בעמוד", n(s.avgSecondsOnPage), "—"],
        ["משתמשים רשומים", n(s.users), `+${n(s.newUsers)} בטווח`],
        ["סוחרים פעילים", n(s.activeTraders), "—"],
        ["עסקאות", n(s.trades), "—"],
        ["נקודות ששוחקו", n(s.volume), "—"],
        ["שווקים פתוחים / הוכרעו", `${n(s.openMarkets)} / ${n(s.resolvedMarkets)}`, "—"],
      ],
    ),
    "",
  );

  out.push("## משפך", "");
  out.push(
    table(
      ["שלב", "כמות", "המרה מהשלב הקודם"],
      b.funnel.map((f) => [f.label, n(f.count), p(f.rate)]),
    ),
    "",
  );

  out.push("## עמודים מובילים", "");
  out.push(
    table(
      ["נתיב", "צפיות", "מבקרים", "שניות בעמוד", "נטישה"],
      b.traffic.pages.slice(0, 20).map((x) => [x.path, n(x.views), n(x.visitors), n(x.avgSeconds), p(x.bounceRate)]),
    ),
    "",
  );

  out.push("## מקורות תנועה", "");
  out.push(
    table(
      ["מקור", "צפיות", "מבקרים"],
      b.traffic.referrers.slice(0, 15).map((x) => [x.key, n(x.count), n(x.visitors)]),
    ),
    "",
  );

  out.push("## שווקים לפי מעורבות", "");
  out.push(
    table(
      ["שוק", "קטגוריה", "סטטוס", "צפיות", "מבקרים", "עסקאות", "נפח", "המרה"],
      b.markets.byMarket
        .slice(0, 30)
        .map((m) => [
          m.title.slice(0, 70),
          m.category,
          m.status,
          n(m.views),
          n(m.visitors),
          n(m.trades),
          n(m.volume),
          p(m.conversion),
        ]),
    ),
    "",
  );

  out.push("## איכות השאלות", "");
  const c = b.markets.calibration;
  out.push(
    table(
      ["מדד", "ערך"],
      [
        ["שווקים שהוכרעו", n(c.resolved)],
        ["Brier של המחיר הפותח", n(c.brierInitial)],
        ["Brier של המחיר לפני ההכרעה", n(c.brierFinal)],
        ["שיעור תשובות 'כן'", p(c.yesRate)],
        ["שעות פתיחה ממוצעות", n(c.avgHoursOpen)],
        ["שווקים באיחור הכרעה", n(b.markets.health.overdue)],
        ["שווקים פתוחים בלי עסקאות", n(b.markets.health.noTrades)],
      ],
    ),
    "",
  );

  if (b.performance.webVitals.length) {
    out.push("## ביצועים (Core Web Vitals)", "");
    out.push(
      table(
        ["מדד", "דגימות", "p50", "p75", "p95"],
        b.performance.webVitals.map((v) => [v.metric, n(v.samples), n(v.p50), n(v.p75), n(v.p95)]),
      ),
      "",
    );
  }

  out.push("## שאלות מומלצות לניתוח", "");
  out.push(...b.guide.suggestedQuestions.map((q) => `- ${q}`), "");
  out.push("---", "", "_ה-JSON המלא (`format=json`) מכיל סדרות יומיות, קוהורטות, קליקים ושגיאות._");
  return out.join("\n");
}
