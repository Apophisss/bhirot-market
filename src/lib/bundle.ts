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
  getLandingEngagement,
  getMarketMetrics,
  getPaidAdGroups,
  getPaidCampaigns,
  getPaidFunnel,
  getPaidLanguages,
  getPropBreakdowns,
  getRapidCards,
  getRapidRuns,
  getRapidSummary,
  getRetention,
  getRetentionBySource,
  getRouteVitals,
  getSearchTerms,
  getSlowPages,
  getTimeToFirstTrade,
  getTopPages,
  getTopReferrers,
  getTraffic,
  getTradingStats,
  getUserStats,
  getWebVitals,
  getWebVitalsByDevice,
  range,
  TZ_NAME,
} from "./stats";

/**
 * 2: the deck got a section of its own (`rapid`), users got an acquisition split
 * (`bySource`, `firstTrade`), performance got a device split, and the general
 * funnel's second stage was renamed — `market_view` is now `question_view`, and it
 * counts the deck too. A reader that looks for the old key will not find it, which
 * is what this number is for.
 */
export const BUNDLE_VERSION = 2;

/** What the analysis agent gets told about the site before it looks at a single number. */
function guide(days: number) {
  return {
    what: `חבילת נתונים מלאה של ${SITE_NAME} — ${SITE_TAGLINE}. כל המספרים מחושבים על ${days} הימים האחרונים, אלא אם כתוב אחרת.`,
    howToUse: [
      "התחילו מ-issues: זו רשימת הבעיות שהאתר זיהה על עצמו, ממוינת לפי חומרה, עם רמז לאיפה בקוד לתקן.",
      "אחר כך funnel: איפה נופלים המשתמשים בין כניסה לאתר לבין עסקה ראשונה.",
      "paid הוא המשפך של מי שהגיע מקמפיין ממומן (utm), סשן אחרי סשן: נחיתה → לחיצה → חפיסה → תשובה כאורח → מסך התחברות → חשבון → עסקה. השלב שבו המספר נופל לאפס הוא המקום לתקן. paid.languages היא שפת הדפדפן — התחליף היחיד למדינה, כי אין כותרת גיאוגרפית מאחורי השרת.",
      "rapid הוא החפיסה — המשטח המרכזי של המוצר: summary אומר כמה ריצות היו וכמה עמוק הן הגיעו, runDepth הוא היסטוגרמת עומק הריצה מול שתי המדרגות שמעצבות אותה (הצעה רכה אחרי 3 תשובות, חסימה אחרי 10), ו-byMarket הוא שיעור הדילוג לכל שאלה — הסימן החד ביותר לאיכות של שאלה.",
      "markets.byMarket מראה אילו שאלות מושכות צפיות אך לא עסקאות — זה בדרך כלל בעיה בניסוח השאלה או בתמחור.",
      "users.bySource ו-users.firstTrade מפצלים שימור וזמן-לתשובה-ראשונה לפי מאיפה הגיע החשבון (קמפיין / הזמנה / אורגני). קראו את המכנה: eligibleD1 ו-eligibleD7 הם החשבונות שהחלון בכלל נסגר עליהם.",
      "engagement.props מסכם props שנאספים מזמן ולא סוכמו: webview (דפדפן in-app — Google מסרב לחלקם, וזו הרשמה שנופלת מסיבה שאף מדד אחר לא רואה), first (חדש מול חוזר), שגיאות התחברות ומסחר.",
      "performance מכיל Core Web Vitals אמיתיים מהשדה; מעל 2500ms ב-LCP p75 שווה עבודה. performance.byDevice הוא הפילוח שקובע — 82% מהמבקרים בנייד, ומספר כלל-אתרי מסתיר את הנייד בתוך תערובת.",
      "הציעו שינויים קונקרטיים בקבצים שמופיעים ב-repoMap, והסבירו כל שינוי במונחי המדד שהוא אמור להזיז.",
    ],
    metricsGlossary: {
      visitors: "דפדפן ייחודי ביום. מבוסס על hash מתחלף של IP+User-Agent — אין קוקי ואין זיהוי חוצה-ימים.",
      sessions: "ביקור בטאב אחד (sessionStorage).",
      bounceRate: "אחוז הסשנים עם צפייה בעמוד אחד בלבד.",
      conversion:
        "בשוק: סוחרים ייחודיים חלקי reach — כל מי שהשאלה הוצגה לו, בדף השאלה או בחפיסה. מוגבל ל-100%: המונה הוא חשבונות והמכנה דפדפן-ימים, ולכן הם יכולים להצטלב.",
      reach: "כמה דפדפנים ייחודיים ראו את השאלה בכלל — pageview בדף השאלה או rapid_seen בחפיסה. במצב זריז עונים בלי לפתוח את דף השאלה, ולכן מבקרי הדף לבדם אינם הקהל.",
      build: "meta.build ו-props.build על כל pageview: ה-commit שממנו נבנתה הגרסה שהגישה את המספר. בלעדיו השוואת לפני/אחרי סביב פריסה היא ניחוש.",
      d1d7:
        "users.bySource: D1 = חזרו ביום שאחרי ההרשמה (24–48 שעות), D7 = חזרו בשבוע הראשון (24 שעות עד 7 ימים). ״חזרו״ = כל אירוע או עסקה. המכנה הוא eligibleD1/eligibleD7 — רק חשבונות שהחלון כבר נסגר עליהם.",
      rapidSession:
        "rapid.summary ו-rapid.runDepth נבנים מאירוע rapid_session שנשלח כשעוזבים את החפיסה: shown/answered/skipped/seconds/guest. rapid.byMarket משתמש ב-rapid_seen — ״הכרטיס הפך לעליון״ — כמכנה שלא היה קיים עד עכשיו; skipped שם נגזר (הוצג פחות נענה), ולכן הכרטיס האחרון בכל ריצה נספר כדילוג.",
      paidSession: "סשן שהצפייה הראשונה בו נשאה utm_medium או gclid (קליק על מודעה). ששת השלבים הראשונים ב-paid.funnel נספרים בסשנים; ״נרשמו״ ו״ביצעו עסקה״ נספרים בחשבונות שעליהם נשמר שיוך לקמפיין בעת ההרשמה, ולכן אין להם אחוז מהשלב הקודם. paid.landings = קליקים שהשרת ראה נוחתים על /welcome, לפני JavaScript; ההפרש מהשלב הראשון הוא מי שעזב לפני שהמדידה רצה.",
      landing: "paid.landing — מה מבקרי הקמפיין עשו בדף הנחיתה: חציון שניות (לא ממוצע), חלוקה לרצועות זמן, ועומק הגלילה — גם אצל מי שלא נגע בכלום, כדי לדעת אם הכרטיס בכלל היה על המסך.",
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
    paidFunnel,
    paidCampaigns,
    paidAdGroups,
    paidLanguages,
    landing,
    markets,
    categories,
    calibration,
    contentHealth,
    users,
    cohorts,
    retentionBySource,
    firstTrade,
    trading,
    hours,
    vitals,
    vitalsByDevice,
    routeVitals,
    slowPages,
    errors,
    props,
    rapidSummary,
    rapidCards,
    rapidRuns,
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
    getPaidFunnel(r),
    getPaidCampaigns(r, 25),
    getPaidAdGroups(r, 25),
    getPaidLanguages(r, 10),
    getLandingEngagement(r),
    getMarketMetrics(r, { limit: marketLimit }),
    getCategoryMetrics(r),
    getCalibration(),
    getContentHealth(),
    getUserStats(r),
    getRetention(12),
    getRetentionBySource(days),
    getTimeToFirstTrade(days),
    getTradingStats(r),
    getHourHistogram(r),
    getWebVitals(r),
    getWebVitalsByDevice(r),
    getRouteVitals(r, ["LCP", "INP"], { limit: 30 }),
    getSlowPages(r, 15),
    getClientErrors(r, 25),
    getPropBreakdowns(r),
    getRapidSummary(r),
    getRapidCards(r, 40),
    getRapidRuns(r),
    getAgentRuns(30),
    // the issue rules read the paid funnel too; computed once above, handed in here
    getPaidFunnel(r).then((paid) => getIssues(r, { paid })),
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
      // The commit the running image was built from (Dockerfile / deploy.yml), and
      // the same stamp every pageview carries in props.build. Two bundles taken
      // across a deploy can be compared only if it is known which build produced
      // each of them; "dev" is a build that no deploy made.
      build: process.env.NEXT_PUBLIC_BUILD_SHA || "dev",
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
    paid: {
      funnel: paidFunnel.stages,
      visitors: paidFunnel.visitors,
      landings: paidFunnel.landings,
      byCampaign: paidCampaigns,
      byAdGroup: paidAdGroups,
      languages: paidLanguages,
      landing,
    },
    traffic: {
      daily: dailyTraffic,
      pages,
      referrers,
      campaigns,
      devices,
      countries,
      hourOfDay: hours,
    },
    engagement: { events, clicks, searches, props },
    rapid: { summary: rapidSummary, byMarket: rapidCards, runDepth: rapidRuns },
    business: { daily: dailyBusiness, trading },
    markets: { health: contentHealth, calibration, byCategory: categories, byMarket: markets },
    users: { stats: users, cohorts, bySource: retentionBySource, firstTrade },
    performance: { webVitals: vitals, byDevice: vitalsByDevice, routeVitals, slowPages, clientErrors: errors },
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
      b.funnel.map((f) => [f.label, n(f.count), f.rate == null ? "—" : p(f.rate)]),
    ),
    "",
  );

  out.push("## משפך התנועה בתשלום (קמפיינים)", "");
  out.push(
    `${n(b.paid.landings)} נחיתות מקליק נרשמו בשרת · ${n(b.paid.visitors)} מבקרים ייחודיים מקמפיין נמדדו בדפדפן. ששת השלבים הראשונים בסשנים, השניים האחרונים בחשבונות עם שיוך לקמפיין.`,
    "",
  );
  out.push(
    table(
      ["שלב", "כמות", "המרה מהשלב הקודם"],
      b.paid.funnel.map((f) => [f.label, n(f.count), f.rate == null ? "—" : p(f.rate)]),
    ),
    "",
  );
  const L = b.paid.landing;
  if (L.exits) {
    out.push(
      `דף הנחיתה, סשנים מקמפיין (${n(L.exits)} יציאות): חציון ${n(L.medianSeconds)} שנ׳ · עד 5 שנ׳ ${p(L.under5s)} · 5–15 ${p(L.under15s)} · 15–60 ${p(L.under60s)} · מעל דקה ${p(L.over60s)} · עומק גלילה ממוצע ${p(L.avgScroll)} (${p(L.avgScrollUntouched)} אצל מי שלא נגע בכלום)`,
      "",
    );
  }
  if (b.paid.byCampaign.length) {
    out.push(
      table(
        ["קמפיין", "סשנים", "עמוד שני", "חפיסה", "ענו", "התחברות", "נרשמו", "סחרו"],
        b.paid.byCampaign.map((c) => [c.key, n(c.sessions), n(c.engaged), n(c.deck), n(c.answered), n(c.login), n(c.signups), n(c.traders)]),
      ),
      "",
    );
  }
  if (b.paid.byAdGroup.length) {
    out.push(
      table(
        ["קמפיין / קבוצת מודעות (utm_content)", "סשנים", "עשו משהו", "חפיסה"],
        b.paid.byAdGroup.map((g) => [g.key, n(g.sessions), n(g.touched), n(g.deck)]),
      ),
      "",
    );
  }
  if (b.paid.languages.length) {
    out.push(
      "שפת הדפדפן של מבקרי הקמפיין (התחליף למדינה): " +
        b.paid.languages.map((l) => `${l.key} ${n(l.visitors)}`).join(" · "),
      "",
    );
  }

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

  const R = b.rapid.summary;
  out.push("## החפיסה (מצב זריז)", "");
  out.push(
    `${n(R.runs)} ריצות (${n(R.guestRuns)} בלי חשבון) · ${n(R.shown)} כרטיסים הוצגו · ${n(R.answered)} נענו (${p(R.answerRate)}) · ${n(R.answersPerRun)} תשובות לריצה · ${n(R.avgSeconds)} שנ׳ לריצה בממוצע`,
    "",
  );
  if (b.rapid.runDepth.length) {
    out.push("עומק הריצה — כמה תשובות ניתנו לפני שהריצה נגמרה (ההצעה הרכה ב-3, החסימה ב-10):", "");
    out.push(
      table(
        ["תשובות בריצה", "ריצות", "מתוכן אורחים", "כרטיסים בממוצע", "שניות בממוצע"],
        b.rapid.runDepth.map((d) => [d.label, n(d.runs), n(d.guestRuns), n(d.avgShown), n(d.avgSeconds)]),
      ),
      "",
    );
  }
  if (b.rapid.byMarket.length) {
    out.push("השאלות שהכי מדלגים עליהן בחפיסה (מינימום 3 הצגות):", "");
    out.push(
      table(
        ["שאלה", "הוצגה", "נענתה", "דילוג"],
        b.rapid.byMarket.slice(0, 20).map((m) => [m.title.slice(0, 70), n(m.shown), n(m.answered), p(m.skipRate)]),
      ),
      "",
    );
  }

  out.push("## שווקים לפי מעורבות", "");
  out.push(
    table(
      ["שוק", "קטגוריה", "סטטוס", "צפיות", "מבקרים", "נחשפו (דף+חפיסה)", "עסקאות", "נפח", "המרה"],
      b.markets.byMarket
        .slice(0, 30)
        .map((m) => [
          m.title.slice(0, 70),
          m.category,
          m.status,
          n(m.views),
          n(m.visitors),
          n(m.reach),
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

  out.push("## שימור וזמן לתשובה ראשונה, לפי מקור", "");
  if (b.users.bySource.length) {
    out.push(
      table(
        ["מקור", "חשבונות", "ענו אי פעם", "D1", "D7"],
        b.users.bySource.map((u) => [
          u.key,
          n(u.users),
          n(u.traded),
          u.eligibleD1 ? `${n(u.d1)}/${n(u.eligibleD1)} (${p(u.d1 / u.eligibleD1)})` : "—",
          u.eligibleD7 ? `${n(u.d7)}/${n(u.eligibleD7)} (${p(u.d7 / u.eligibleD7)})` : "—",
        ]),
      ),
      "",
      "D1 = חזרו ביום שאחרי (24–48 שעות), D7 = חזרו תוך שבוע. המכנה הוא רק חשבונות שהחלון כבר נסגר עליהם, ולכן ״—״ = מוקדם מדי לדעת.",
      "",
    );
    out.push(
      table(
        ["מקור", "חשבונות", "ענו", "חציון דקות לתשובה הראשונה", "ענו באותו יום"],
        b.users.firstTrade.map((f) => [f.key, n(f.accounts), n(f.traded), f.traded ? n(f.medianMinutes) : "—", n(f.sameDay)]),
      ),
      "",
    );
  } else out.push("_אין עדיין חשבונות בטווח הזה._", "");

  if (b.performance.webVitals.length) {
    out.push("## ביצועים (Core Web Vitals)", "");
    out.push(
      table(
        ["מדד", "דגימות", "p50", "p75", "p95"],
        b.performance.webVitals.map((v) => [v.metric, n(v.samples), n(v.p50), n(v.p75), n(v.p95)]),
      ),
      "",
    );
    if (b.performance.byDevice.length) {
      out.push("לפי מכשיר — זה הפילוח שקובע, כי רוב המבקרים בנייד:", "");
      out.push(
        table(
          ["מדד", "מכשיר", "דגימות", "p50", "p75", "p95"],
          b.performance.byDevice.map((v) => [v.metric, v.device, n(v.samples), n(v.p50), n(v.p75), n(v.p95)]),
        ),
        "",
      );
    }
    if (b.performance.routeVitals.length) {
      out.push("הנתיבים האיטיים ביותר (p75, לפי מכשיר):", "");
      out.push(
        table(
          ["מדד", "נתיב", "מכשיר", "דגימות", "p75"],
          b.performance.routeVitals.slice(0, 20).map((v) => [v.metric, v.path, v.device, n(v.samples), n(v.p75)]),
        ),
        "",
      );
    }
  }

  out.push("## שאלות מומלצות לניתוח", "");
  out.push(...b.guide.suggestedQuestions.map((q) => `- ${q}`), "");
  out.push("---", "", "_ה-JSON המלא (`format=json`) מכיל סדרות יומיות, קוהורטות, קליקים ושגיאות._");
  return out.join("\n");
}
