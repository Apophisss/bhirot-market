/**
 * The site's event catalogue. Shared by the browser tracker (`src/lib/track.ts`),
 * the collector (`/api/analytics/collect`), the admin dashboard and the data bundle.
 * Adding an event? Add it here with a Hebrew description so it shows up documented
 * in the bundle that gets handed to an analysis agent.
 */
export const EVENTS = {
  /** a page was rendered in the browser (path + referrer + utm) */
  pageview: "pageview",
  /** the visitor left the page: value = ms on page, props.scroll = max scroll depth (0-1) */
  pageExit: "page_exit",
  /** click on an element carrying data-evt (props.id says which) */
  click: "click",
  /** click on a link that leaves the site (props.host) */
  outbound: "outbound",
  /** search from the header (props.q) */
  search: "search",
  /** the trade panel was submitted (props.side/action, value = ₪ or shares) */
  tradeAttempt: "trade_attempt",
  /** a trade was executed — recorded server-side, so it is the authoritative number */
  trade: "trade",
  /** a trade was rejected (props.reason) */
  tradeError: "trade_error",
  /** a comment was posted — recorded server-side */
  comment: "comment",
  /** a new account was created — recorded server-side on first sign-in */
  signup: "signup",
  /** an existing user signed in — recorded server-side */
  login: "login",
  /** Core Web Vital sample (props.metric = LCP/CLS/INP/…, value = the metric) */
  webVital: "web_vital",
  /** an uncaught browser error or rejected promise (props.message) */
  clientError: "client_error",
  /** the analysis bundle was downloaded from the admin area */
  bundleDownload: "bundle_download",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Hebrew labels, used by the admin dashboard and shipped inside the data bundle. */
export const EVENT_LABELS: Record<string, string> = {
  [EVENTS.pageview]: "צפייה בעמוד",
  [EVENTS.pageExit]: "יציאה מעמוד (זמן שהייה)",
  [EVENTS.click]: "לחיצה על אלמנט מסומן",
  [EVENTS.outbound]: "יציאה לקישור חיצוני",
  [EVENTS.search]: "חיפוש",
  [EVENTS.tradeAttempt]: "ניסיון עסקה",
  [EVENTS.trade]: "עסקה שבוצעה",
  [EVENTS.tradeError]: "עסקה שנדחתה",
  [EVENTS.comment]: "תגובה",
  [EVENTS.signup]: "הרשמה",
  [EVENTS.login]: "התחברות",
  [EVENTS.webVital]: "מדד ביצועים",
  [EVENTS.clientError]: "שגיאת דפדפן",
  [EVENTS.bundleDownload]: "הורדת באנדל נתונים",
};

/** Click ids used by `data-evt` attributes around the site (documented for the analyst). */
export const CLICK_IDS: Record<string, string> = {
  "nav-markets": "ניווט: שווקים",
  // the page is gone, but clicks recorded before it went keep their label in the dashboard
  "nav-for-you": "ניווט: מומלץ בשבילי (הוסר)",
  "nav-rapid": "ניווט: מצב זריז",
  "nav-activity": "ניווט: פעילות",
  "nav-leaderboard": "ניווט: מובילים",
  "nav-about": "ניווט: איך זה עובד",
  mobilenav: "ניווט תחתון (מובייל)",
  "header-login": "כפתור התחברות בהדר",
  "hero-rapid": "CTA מצב זריז בהירו",
  "hero-login": "CTA התחברות בהירו",
  "hero-portfolio": "CTA לתיק שלי בהירו",
  "hero-about": "CTA איך זה עובד בהירו",
  "browser-rapid": "מעבר למצב זריז מרשימת השווקים",
  "market-card": "כרטיס שוק ברשימה",
  "market-card-yes": "כפתור כן בכרטיס",
  "market-card-no": "כפתור לא בכרטיס",
  "category-tab": "טאב קטגוריה",
  "sort-tab": "מיון רשימה",
  "status-tab": "פתוחים/הוכרעו",
  "candidate-chip": "סינון לפי מועמד",
  "show-more": "הצגת עוד שאלות",
  "market-source": "מקור בכתבת השוק",
  "related-market": "שוק קשור",
  "footer-link": "קישור בפוטר",
  "footer-category": "קטגוריה בפוטר",
  "bundle-json": "הורדת באנדל JSON",
  "bundle-md": "הורדת דוח Markdown",
};
