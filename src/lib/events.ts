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
  /** a question was shared from its card or its page (props.path) */
  share: "share",
  /** the trade panel was submitted (props.side/action, value = ₪ or shares) */
  tradeAttempt: "trade_attempt",
  /** a trade was executed — recorded server-side, so it is the authoritative number */
  trade: "trade",
  /** a trade was rejected (props.reason) */
  tradeError: "trade_error",
  /** a comment was posted — recorded server-side */
  comment: "comment",
  /** a friend request was sent — recorded server-side, without who was asked */
  friendRequest: "friend_request",
  /** a friend request was accepted — recorded server-side, without who accepted whom */
  friendAccept: "friend_accept",
  /** a league was opened — recorded server-side */
  leagueCreate: "league_create",
  /** someone joined a league, through the link or through an invitation */
  leagueJoin: "league_join",
  /** a new account was created — recorded server-side on first sign-in */
  signup: "signup",
  /** an existing user signed in — recorded server-side */
  login: "login",
  /** Core Web Vital sample (props.metric = LCP/CLS/INP/…, value = the metric) */
  webVital: "web_vital",
  /** an uncaught browser error or rejected promise (props.message) */
  clientError: "client_error",
  /** a question was proposed from /suggest — recorded server-side (props.loggedIn) */
  suggestion: "suggestion",
  /** a message was sent from /contact — recorded server-side (props.loggedIn) */
  contactMessage: "contact_message",
  /** the preferences survey was answered or skipped (props.status, props.topics/people counts) */
  survey: "survey",
  /** an invite link actually paid out — recorded server-side (props.result) */
  referralClaimed: "referral_claimed",
  /** a user signed out — recorded server-side */
  logout: "logout",
  /** the analysis bundle was downloaded from the admin area */
  bundleDownload: "bundle_download",
  /** the add-to-home-screen offer (props.action = shown/prompted/accepted/dismissed/instructions/installed, props.platform) */
  installApp: "install_app",
  /** the "מצב זריז" offer that opens a visit (props.action = shown, props.loggedIn) */
  rapidGate: "rapid_gate",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Hebrew labels, used by the admin dashboard and shipped inside the data bundle. */
export const EVENT_LABELS: Record<string, string> = {
  [EVENTS.pageview]: "צפייה בעמוד",
  [EVENTS.pageExit]: "יציאה מעמוד (זמן שהייה)",
  [EVENTS.click]: "לחיצה על אלמנט מסומן",
  [EVENTS.outbound]: "יציאה לקישור חיצוני",
  [EVENTS.search]: "חיפוש",
  [EVENTS.share]: "שיתוף שאלה",
  [EVENTS.tradeAttempt]: "ניסיון עסקה",
  [EVENTS.trade]: "עסקה שבוצעה",
  [EVENTS.tradeError]: "עסקה שנדחתה",
  [EVENTS.comment]: "תגובה",
  [EVENTS.friendRequest]: "בקשת חברות",
  [EVENTS.friendAccept]: "אישור חברות",
  [EVENTS.leagueCreate]: "פתיחת ליגה",
  [EVENTS.leagueJoin]: "הצטרפות לליגה",
  [EVENTS.signup]: "הרשמה",
  [EVENTS.login]: "התחברות",
  [EVENTS.webVital]: "מדד ביצועים",
  [EVENTS.clientError]: "שגיאת דפדפן",
  [EVENTS.suggestion]: "הצעת שאלה",
  [EVENTS.contactMessage]: "הודעה ליצירת קשר",
  [EVENTS.survey]: "שאלון העדפות",
  [EVENTS.referralClaimed]: "הזמנה שנפדתה",
  [EVENTS.logout]: "יציאה",
  [EVENTS.bundleDownload]: "הורדת באנדל נתונים",
  [EVENTS.installApp]: "הוספה למסך הבית",
  [EVENTS.rapidGate]: "הצעת מצב זריז בכניסה",
};

/** Click ids used by `data-evt` attributes around the site (documented for the analyst). */
export const CLICK_IDS: Record<string, string> = {
  "nav-markets": "ניווט: שווקים",
  // the page is gone, but clicks recorded before it went keep their label in the dashboard
  "nav-for-you": "ניווט: מומלץ בשבילי (הוסר)",
  "nav-rapid": "ניווט: מצב זריז",
  "nav-activity": "ניווט: פעילות",
  "nav-about": "ניווט: איך זה עובד",
  mobilenav: "ניווט תחתון (מובייל)",
  "header-login": "כפתור התחברות בהדר",
  "header-balance": "יתרה בהדר",
  "mobile-search-open": "פתיחת חיפוש במובייל",
  "share-market": "שיתוף שאלה",
  "browser-suggest": "הצעת שאלה מסוף הרשימה",
  "menu-leaderboard": "תפריט המשתמש: לוח המובילים",
  "menu-friends": "תפריט המשתמש: חברים",
  "menu-leagues": "תפריט המשתמש: ליגות",
  "friends-search": "חיפוש אנשים בדף החברים",
  "league-copy-link": "העתקת קישור הזמנה לליגה",
  "league-share": "שיתוף קישור הליגה",
  "portfolio-friends": "חברים מדף התיק",
  "portfolio-leaderboard": "לוח המובילים מדף התיק",
  "hero-rapid": "CTA מצב זריז בהירו",
  "hero-login": "CTA התחברות בהירו",
  "hero-portfolio": "CTA לתיק שלי בהירו",
  "hero-about": "CTA איך זה עובד בהירו",
  "browser-rapid": "מעבר למצב זריז מרשימת השווקים",
  "home-rapid-end": "CTA מצב זריז בתחתית דף הבית",
  "market-rapid": "מעבר למצב זריז מדף השאלה",
  "market-rapid-side": "מעבר למצב זריז מהצד בדף השאלה",
  "trade-done-rapid": "מעבר למצב זריז אחרי תשובה בדף השאלה",
  "category-rapid": "מעבר למצב זריז מכותרת הקטגוריה",
  "category-rapid-end": "מעבר למצב זריז מסוף דף הקטגוריה",
  "leaderboard-rapid": "מעבר למצב זריז מלוח המובילים",
  "activity-rapid": "מעבר למצב זריז מדף הפעילות",
  "suggest-rapid": "מעבר למצב זריז מדף הצעת שאלה",
  "howtoplay-rapid": "מעבר למצב זריז מ״איך מתחילים לשחק״",
  "footer-rapid": "מצב זריז בפוטר",
  "404-rapid": "מעבר למצב זריז מדף 404",
  "invite-rapid": "מעבר למצב זריז מדף ההזמנות",
  "rapid-skip": "דילוג על שאלה במצב זריז",
  "rapid-undo": "ביטול תשובה במצב זריז",
  "rapid-undo-dismiss": "החלקת סרגל הביטול למטה במצב זריז",
  "rapid-guest-gate": "חסימת אורח במצב זריז",
  "rapid-guest-note": "שורת ההתחברות מעל החפיסה במצב זריז",
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
  "footer-install": "הוספה למסך הבית מהפוטר",
  "entry-gate-rapid": "מעבר למצב זריז מהשער בכניסה",
  "entry-gate-dismiss": "דחיית השער בכניסה",
  "install-prompt-add": "הוספה למסך הבית מהכרטיס",
  "install-prompt-later": "דחיית ההצעה להוסיף למסך הבית",
  "install-sheet-add": "התקנה בלחיצה אחת מתוך החלון",
  "bundle-json": "הורדת באנדל JSON",
  "bundle-md": "הורדת דוח Markdown",
};
