# תדריך ל-Claude Cowork — תוכנית האופטימיזציה של ״בחירות מרקט״

> **המסמך הזה עומד בפני עצמו.** מי שקורא אותו לא היה בשיחות שבהן הוא נכתב.
> **קרא אותו מההתחלה עד הסוף לפני שאתה נוגע במשהו**, ובמיוחד את סעיף 3 (איפה עוצרים).
> נכתב ב-6.9.2026, אחרי ביקורת עומק של הקוד, הנתונים החיים וצילומי מסך בנייד, וכל טענה בו
> נבדקה מול הקוד. המספרים כאן נכונים לאותו יום; לפני כל החלטה — משוך נתונים טריים (סעיף 2).
> מספרים שמקורם בשרת החי בלבד (״284 בלי אף עסקה״, ״5 שחקנים אמיתיים״, זמני LCP/TTFB) אי אפשר
> לאמת מהריפו — אמת אותם מול החבילה לפני שאתה בונה עליהם החלטה.

מסמכים אחים שאתה חייב להכיר:

| מסמך | מה יש בו | מתי לקרוא |
|---|---|---|
| `ads/COWORK-BRIEF.md` | הקמת קמפיין Google Ads ושגרת האופטימיזציה השבועית שלו | לפני כל פעולה בחשבון המודעות |
| `AGENT.md` + `.claude/routines/*.md` + `.claude/skills/*` | רוטינת השאלות וההכרעות: איך נכתבת שאלה, איך מוכרעת, מה אסור | לפני כל שינוי בכללי התוכן |
| `README.md` | ארכיטקטורה, פריסה, API, אנליטיקה, לוח הניהול | כשצריך לדעת ״איפה זה בקוד״ |
| `ops/LOG.md` | יומן האופטימיזציה: מה שונה, מתי, מה נמדד | **בתחילת כל סשן** ובסוף כל שינוי |

---

## 0. המשימה, ומה נחשב הצלחה

**המשימה:** להפוך מבקרים לשחקנים שחוזרים. לא ״עוד תנועה״ — אנשים שעונים על שאלות, רואים
שהן הוכרעו, וחוזרים לענות שוב.

האתר הוא משחק ידע בנקודות משחק על הפוליטיקה הישראלית לקראת בחירות 27.10.2026. אין כסף
אמיתי, אין פרסים, אין תשלום. כל שיפור חייב לשמור על שלוש העובדות האלה גם בניסוח וגם במכניקה
(ראו סעיף 3).

### מדד הצפון ומדדי התמיכה

| מדד | הגדרה | היום (6.9) | יעד ל-30 יום | איפה קוראים |
|---|---|---|---|---|
| **שחקנים פעילים שבועיים** | חשבונות עם ≥1 תשובה בשבוע | 5 | 60 | `users.stats.activeTraders` (טווח 7) |
| הפעלה: נחיתה ממומנת → נגעו במשהו | `paid_touched / paid_sessions` | ~11% | ≥35% | `paid.funnel`, `/admin/traffic` |
| הפעלה: נחיתה ממומנת → חפיסה | `paid_deck / paid_sessions` | לא נמדד עד היום | ≥25% | `paid.funnel` |
| הפעלה: הרשמה → תשובה ראשונה באותו יום | מתוך חשבונות חדשים | 5/6 אי פעם; ״אותו יום״ לא נמדד | ≥70% | `users.timeToFirstTrade` (להוסיף, B4) |
| שימור: חזרו ביום שאחרי / תוך שבוע | D1 / D7 מתוך חשבונות חדשים | 2/6 ״חזרו״ (הגדרה גסה) | D1 ≥25%, D7 ≥15% | `users.cohorts` (להוסיף D1/D7, B4) |
| עלות ל-`first_trade` | Google Ads | אין עדיין המרות מדווחות | < ₪45 | Google Ads, לפי `ads/COWORK-BRIEF.md` |
| בריאות הלוח: שאלות פתוחות | | 343 בקובץ / 349 בשרת | ≤80 | `/api/health`, `markets.health` |
| בריאות הלוח: חוב הכרעות | שאלות שעבר מועדן ולא הוכרעו, בכל ריצה | 2–10 | 0 | `issues`, `markets.health.overdue` |
| בריאות הלוח: זמן הכרעה | חציון שעות מ-`closesAt` להכרעה | 12–20 | < 3 ביום, < 14 בלילה | להוסיף (D3) |
| מהירות: LCP p75 בנייד | Core Web Vitals מהשדה | 1.87s (דף הבית 3.3s ממוצע) | < 2.0s בכל דף | `performance.webVitals`, `slowPages` |
| מהירות: TTFB p50 | | 780ms | < 500ms | `performance.webVitals` |
| אמון | סתירות בין `/about` למה שהמוצר מציג | 4 (סעיף 4.1) | 0 | ביקורת ידנית, סעיף 5.A |

**איך לקרוא את הטבלה:** מדד הצפון הוא השורה הראשונה. כל שאר השורות הן ״מנופים״ — כשאחד מהם זז,
מדד הצפון אמור לזוז אחריו תוך שבוע-שבועיים. אם מנוף זז ומדד הצפון לא — המנוף לא היה חשוב, תכתוב
את זה ביומן ותעבור הלאה.

---

## 1. מודל ההפעלה — מי עושה מה

| תפקיד | מה הוא עושה | מה הוא לא עושה |
|---|---|---|
| **אתה (Cowork)** | הבעלים של הלולאה: מודד → מתעדף → מגדיר → מוודא → מדווח. עושה בעצמך את כל מה שנעשה בדפדפן (Google Ads, GA4, Search Console, לוח הניהול), שינויי קופי וטקסט, כללי תוכן, תיעוד, ניתוח נתונים, ובדיקות ידניות/אוטומטיות של האתר. | לא מבצע לבד שינויים במכניקת הכסף, בהכרעות, בכללי הדירוג ובעמודים המשפטיים (סעיף 3). |
| **Claude Code** (בריפו) | מבצע שינויי קוד לפי תדריך שאתה כותב (תבנית בנספח ו׳): ענף, PR, בדיקות ירוקות, צילומי מסך לפני/אחרי. | לא מחליט מה לבנות. אם התדריך לא ברור — הוא שואל אותך, לא ממציא. |
| **בעל האתר** (אדם) | מאשר: הכרעות, ביטולי שאלות שנסחרו, שינויים בכלכלה, עמודים משפטיים, תקציב ומודעות, כל דבר עם 🛑. | לא צריך לאשר תיקוני קופי, SEO, ביצועים, מדידה, תיעוד. |

**כלל הזהב של הלולאה: שינוי אחד לכל משטח בשבוע.** אם שינית את דף הנחיתה ואת המודעה באותו
שבוע — לא תדע מה עבד. ״משטח״ = דף הנחיתה, החפיסה, מסך ההתחברות, דף השאלה, דף הבית, הקמפיין.

**הגדרת ״גמור״ לכל שינוי:** (1) PR ממוזג ו-CI ירוק; (2) הפריסה הסתיימה ו-`/api/health` עונה;
(3) בדקת בעצמך באתר החי בנייד; (4) כתבת ביומן `ops/LOG.md` מה שונה, מתי, ומה המדד שאמור לזוז;
(5) אחרי 24 שעות ואחרי 7 ימים חזרת וכתבת מה קרה. בלי 4 ו-5 השינוי לא נספר.

---

## 2. גישה, כלים ופקודות

### 2.1 הריפו

```bash
git clone https://github.com/Apophisss/bhirot-market && cd bhirot-market
npm ci --no-audit --no-fund
npm run typecheck && npm run lint && npm test     # מה ש-CI מריץ
npm run build                                     # הבנייה — חובה לפני כל PR
npm run markets:audit                             # בריאות הלוח (חוב הכרעות, תמהיל מועדים, כפילויות)
npm run markets:validate                          # סכמת data/markets.json
npm run resolve -- propose --from-server          # מה מחכה להכרעה (לא מכריע!)
```

- ענף לכל שינוי: `cowork/<נושא>-<תאריך>`. **אף פעם לא דוחפים ל-`main` ישירות** — כל דחיפה
  ל-`main` פורסת לאוויר תוך ~4 דקות (`.github/workflows/deploy.yml`).
- הודעות commit ו-PR בעברית, בסגנון הקיים (`git log --oneline -20`).
- הרצה מקומית לבדיקה: `cp .env.example .env.local`, `npm run build && npm start`, ואז
  `http://127.0.0.1:3000`. Google לא מוגדר מקומית — ההתחברות לא תעבוד, וזה בסדר לבדיקות של
  מסלול האורח. **מצב זריז לאורח, דף הנחיתה ומסך ההתחברות** נבדקים מקומית במלואם.

### 2.2 הנתונים החיים

| מה | איך | הערות |
|---|---|---|
| חבילת הנתונים | `GET https://bhirot-market.com/api/admin/bundle?days=7&format=md&download=0` עם `Authorization: Bearer <ADMIN_TOKEN>` | הסוד נקרא `ADMIN_TOKEN` ונמצא בסודות הפריסה בלבד. **לעולם לא לכתוב את ערכו** בדוח, בקובץ או בכתובת. `format=json` לניתוח, `days=1` ליום שאחרי שינוי. |
| לוח הניהול | `/admin`, `/admin/traffic`, `/admin/markets`, `/admin/users`, `/admin/bundle`, `/admin/inbox` | כניסה ב-`/admin/login` עם הטוקן (עוגייה ל-30 יום) או בחשבון Google שב-`ADMIN_EMAILS`. |
| בריאות | `GET /api/health` (ציבורי) | `stats`, `analytics.lastEventAt`, `lastAgentRun`. הבדיקה הראשונה אחרי כל פריסה. |
| GA4 | הנכס של `G-R9TC3LK5KE` (המזהה מוגדר בסודות הפריסה, לא בריפו) | כל אירוע של האתר מגיע גם לשם (`src/lib/ga-bridge.ts`). Realtime/DebugView = הדרך המהירה לראות שאירוע יורה אחרי פריסה. |
| Google Ads | לפי `ads/COWORK-BRIEF.md` | |
| Search Console | להוסיף את הדומיין אם עוד לא | הקריאה היחידה שיש על ביצועים אורגניים. |

**מה לקרוא קודם בחבילה, ובסדר הזה:** `meta.analytics.oldestEvent` (האם החלון מכוסה?) →
`issues[]` → `paid.landings` מול `paid.funnel[0]` ואז כל שלב → `paid.landing` (חציון שניות,
גלילה של מי שלא נגע) → `paid.byCampaign` / `byAdGroup` / `languages` → `funnel` →
`traffic.pages` ל-`/welcome`, `/rapid`, `/login` → `engagement.events` ו-`engagement.clicks`
→ `users.cohorts` → `performance.webVitals` → `performance.clientErrors[0]`.

**הסתייגויות שחייבות ללוות כל מספר שאתה מדווח** (פירוט בנספח א׳): מבקר = דפדפן-יום, לא אדם;
סשן = לשונית; היומן עמוק רק מ-5.9.2026; אין מדינה (תמיד `??`), יש שפת דפדפן; ממוצעים ולא
חציונים ברוב המקומות; מתחת ל-30 במכנה — לא מצטטים אחוז בלי לציין n.

### 2.3 בדיקה בנייד לפני ואחרי

כל שינוי במסך שאנשים רואים נבדק ב-390×664 (iPhone 12) ו-320px (iPhone SE), לפני ואחרי, בבנייה
המקומית. יש תבנית: סקריפט Playwright שנוחת מ-`/welcome?utm_source=google&utm_medium=demandgen&utm_campaign=quiz&gclid=TEST`,
עונה על כרטיס, ממשיך לחפיסה, ומצלם. חסום תמיד את `**/api/analytics/collect` ואת
`googletagmanager.com` כדי לא ללכלך את הנתונים. מדוד: מיקום הכפתור הראשון שאפשר ללחוץ עליו,
גובה הדף, יעדי מגע קטנים מ-44px, גלישה אופקית, שגיאות בקונסול.

---

## 3. איפה עוצרים — קרא לפני הכל

### 🛑 אסור, בשום מצב

| ❌ | הסיבה |
|---|---|
| להכריע שאלה, לאשר הכרעה, או להריץ `resolve -- approve/apply/publish` | הכרעה משלמת נקודות ואי אפשר לבטל אותה. רק אדם מאשר. |
| לשנות `initialProbability`, `liquidity` או `slug` של שאלה קיימת | מחיר ומזהה של שוק שנסחר. `AGENT.md`. |
| לשנות יתרות, פוזיציות או עסקאות במסד הנתונים | כסף של שחקנים, גם אם וירטואלי. |
| להוסיף פרס, מתנה, ״כסף אמיתי״, ״זכייה״, ״תשלום״ או תמריץ בעל ערך — בקוד, בקופי או במודעה | הופך משחק ידע להגרלה/הימור בעיני החוק ובעיני Google. |
| להחזיר לדף הנחיתה או למודעות ניסוחים שנדחו בביקורת של Google: ״מה יקרה״, ״ניחושים״, ״10,000 נקודות במתנה״, ״כל שעה״ | היסטוריית דחיות. המסגור המאושר: ״משחק ידע חינם: כמה טוב אתם מכירים את הפוליטיקה הישראלית?״ |
| להזכיר שם של פוליטיקאי או מפלגה במודעה בלי אימות מפרסם | חוק הבחירות (דרכי תעמולה) + מדיניות Google. `ads/COWORK-BRIEF.md` §8. |
| להרחיב את המספרים המפוברקים (`fake-*`, `display-stats`) או להוסיף חדשים | סיכון האמון הגדול ביותר באתר (סעיף 5.A). מותר רק לצמצם ולסמן. |
| לדחוף ל-`main`, לדלג על בדיקה, להשבית/להסיר בדיקה כדי ש-CI יעבור | `main` = פריסה. |
| לגעת ב-`ANALYTICS_SALT`, `ANALYTICS_DISABLED`, `ANALYTICS_RETENTION_DAYS`, `AUTH_SECRET`, `ADMIN_TOKEN` | שובר מדידה / מנתק את כל המשתמשים. |
| להעתיק שמות, אימיילים, IP או מזהי משתמש לדוח, לקובץ משותף או לכלי חיצוני | `/admin/users` ו-`/admin/inbox` מכילים כאלה. החבילה — לא. |
| לשנות תקציב, הצעות מחיר או לפרסם מודעה בלי אישור מפורש | `ads/COWORK-BRIEF.md` §1. |

### ⚠️ שואלים קודם (מציגים הצעה עם הנימוק, מחכים לתשובה)

- כל שינוי בכלכלה: יתרת פתיחה, תקרת תשובה, תקרת פוזיציה, בונוס הזמנה, קצבה יומית, עונות.
- כל שינוי בכלל הדירוג של לוח המובילים.
- ביטול (CANCELLED) של שאלות שנסחרו, גם כפילויות. שאלות **בלי אף עסקה** — מותר להציע ברשימה ולקבל אישור אחד לכולן.
- `GUEST_LIMIT` ו-`GUEST_SOFT_ASK` (10 ו-3 תשובות) — משנים רק עם נתונים של ≥100 ריצות.
- תוכן העמודים המשפטיים (`/terms`, `/privacy`, `/about` סעיפי ״מי אנחנו״): זהות המפעיל, אימייל, גילוי על מודל שפה — החלטה של בעל האתר, אתה מכין את הנוסח.
- הסרת המספרים המפוברקים לגמרי (לעומת סימונם) — החלטת מוצר של הבעלים.
- כל דבר שמשנה מה קורה ב-`settleMarket` / `executeTrade`.

### ✅ מותר בלי לשאול

ניתוח, תדריכים ל-Claude Code, תיקוני קופי (בגבולות סעיף 3), מטא-נתונים ו-SEO, ביצועים, תוספות
מדידה, תיעוד, כללי תוכן ב-`AGENT.md`/רוטינות, היגיינת קמפיין בגבולות `ads/COWORK-BRIEF.md` §1
(כיבוי נכסים חלשים, החרגת מיקומים, דוחות), פתיחת PR (לא מיזוג של PR שנוגע ברשימת 🛑/⚠️).

**כשאתה עוצר — תמיד שלושה דברים:** מה עשית עד עכשיו, מה חסם אותך, ומה בדיוק אתה צריך כדי להמשיך.

---

## 4. מצב האתר ב-6.9.2026 — מה מצאנו

שבע ביקורות מקבילות (צמיחה ושימור, תוכן ולוח, ביצועים, SEO, UX בנייד, כלכלה ואמון, מדידה) על
הקוד ב-`main`, על חבילת הנתונים החיה ועל בנייה מקומית. תמצית לפי חומרה; הפירוט והמשימות בסעיף 5.

**מה נשלח היום (PR #95, פרוס):** דף הנחיתה נפתח בכרטיס חי מעל הקפל (הכפתור הראשון ירד מ-918px
ל-490px); הצעה רכה עם כפתור Google אחרי 3 תשובות בחפיסה; חומה אחרי 10 שבנויה סביב ערך התשובות;
סיכום ריצה לאורח; חפיסה של 16 כרטיסים לאורח (185KB במקום 548KB); אירועים חדשים
(`landing`, `guest_answer`, `guest_soft_ask`, `guest_gate`, `guest_redeem`, `login_error`) ומשפך
ממומן מלא ב-`/admin/traffic`. **שני אירועים ב-GA4 שינו שם:** `welcome_answer`→`guest_answer`,
`rapid_guest_redeem`→`guest_redeem`. הדוח המלא: בקובץ ההיסטוריה של הפרויקט אצל בעל האתר.

### 4.1 אמון — הבעיה שמעל כולן

- **אף שאלה לא הוכרעה ב-`data/markets.json`** (0 הוכרעו, 17 בוטלו, מהן 16 ככפילויות). השרת מדווח 9 הוכרעו — הקובץ ב-`main` מפגר אחרי השרת, ו-`data/resolutions/` מכיל רק README בלי אף קובץ ריצה.
- **מחולל השאלות השעתי (`src/lib/agent/generate.ts`) מכריע שווקים לבד** כשהמודל מחזיר `confidence: "high"` — בלי אדם, בלי ראיה, בניגוד לכלל ״אף הכרעה לא מתפרסמת בלי אישור״ ב-`AGENT.md`. כרגע לא פעיל (אין ריצות `editorial-cron`), אבל נטען.
- **המספרים המפוברקים סותרים את דף `/about`:** הדף מבטיח קו מקווקו ותווית ״אומדן״ על הגרף — `display-history.ts` מוחק את הסימון לפני שהגרף רואה אותו; אזהרת ״מחיר ראשוני״ לשאלה בלי עסקאות לא יכולה להופיע לעולם כי רצפת העסקאות המפוברקות (4) גבוהה מהסף (3) — במכוון; רשימת ״תשובות אחרונות״ בדף השאלה ו-`/activity` מערבבות שורות מומצאות בלי סימון; ה-API הציבורי ו-`llms.txt` מפרסמים נפח ×3.4.
- **לוח המובילים מדורג לפי שווי כולל** שכולל בונוס הזמנות (500 לחבר, עד 50 חברים = 25,000 — פי 2.5 מיתרת הפתיחה). דף הלוח ו-`/about` אומרים את זה במפורש, אבל `/invite` מבטיח ההפך: ״נספר בנפרד מהרווח וההפסד… כדי שלוח המובילים ימשיך למדוד ניחוש ולא שיתופים״. הדירוג בפועל מתגמל שיתופים. 5 שחקנים אמיתיים בין 320 מפוברקים, בלי שורת גילוי בדף עצמו.
- **הנענוע (drift) של שאלות שקטות** מזיז מחיר עד 2.5 נקודות — יותר ממה שתשובה אמיתית של 20 נקודות מזיזה (0.5). הדירוג זז מהבית, לא מהשחקנים.

### 4.2 הלוח — גדול פי 6 ולא מוכרע בזמן

- 343 שאלות פתוחות בקובץ (349 בשרת); **284 בלי אף עסקה**; 59% נסגרות בעוד חודש ומעלה; 105 אחרי יום הבחירות.
- שאלות שנסגרות תוך 72 שעות: 56% מהן נסחרו, 1.13 עסקאות לשאלה. שאלות של 4+ שבועות: 19%, 0.30. **השאלות הקצרות הן המוצר.**
- 76% מהשאלות נסגרות מ-20:00 והלאה (82% מ-19:00); ריצת ההכרעות הראשונה היא ב-10:00 למחרת → 12–20 שעות של ״נסגר ולא הוכרע״.
- `liquidity=2000` ב-341 מתוך 343 השאלות (שתיים ב-4000) מול תקרת תשובה של 100: להזיז 50%→75% צריך 14 תשובות מקסימליות. המחיר לא מגיב לשחקנים.
- מנוע ההמלצות מחלק לאורח חדש שאלות של ארבעה חודשים לפני שאלות של הלילה (appeal 5 שווה יותר מדחיפות).
- כפילויות והכלה (שאלה רחבה שמכילה צרה) עדיין נכנסות; 44 זוגות לבדיקה בלוח הפתוח.

### 4.3 סיבה לחזור — אין

- אין שום ערוץ חזרה: לא push, לא אימייל, לא ״מאז הביקור הקודם״. **הכרעה של שאלה לא מוצגת למי שענה עליה.** המסך היחיד הוא `/portfolio`.
- סוף ריצה לשחקן מחובר: ״עוד סבב זריז״ / ״לניקוד שלי״ / ״לכל השאלות״. אין ״X מהתשובות שלך מוכרעות עד מחר״, אין הזמנה, אין הצעת התקנה.
- ההזמנה (500 נקודות) לא מופיעה ברגעים הנכונים (אחרי תשובה ראשונה, בסוף ריצה), הכפתורים שלה בלי מדידה, ושיתוף של שאלה לא נושא קוד הפניה. 0 הזמנות מומשו.

### 4.4 המסך הראשון בדף שאלה, ואוצר המילים

- **מודאל ״מצב זריז״ חוסם את המסך הראשון** בעמוד הראשון של כל ביקור (פעם אחת ללשונית) — כולל שאלה שנפתחה מקישור ב-WhatsApp, כי `/market` ו-`/category` אינם ברשימת הדילוג. הוא גם ה-LCP של דף השאלה (2.4s בנייד מואט, מול 0.9s לצביעה הראשונה).
- דף שאלה: המסך הראשון הוא גרף. פאנל התשובה מתחיל 26px מתחת לקפל, והסרגל הדביק לא מופיע.
- פאנל התשובה מדבר בשפת סוחרים: ״החזרה״, ״יחידות״, ״אחיזה״, ״מחיר ממוצע ליחידה״. סכום מעל התקרה מוחלף בשקט. ״נק׳״ משמש גם לנקודות משחק וגם לנקודות אחוז. ארבעה שמות לאותו מספר (״סיכוי ל״כן״״, ״מד הביטחון״, ״מד הניחושים״, ״מחיר״). פנייה ביחיד וברבים לסירוגין.
- מסלול מדף הבית לתשובה ראשונה דרך דף שאלה: ≥7 הקשות + Google. דרך החפיסה: 2.

### 4.5 מהירות

- דף הבית בונה את כל הלוח מ-SQLite בכל בקשה (שלוש קריאות `listMarkets` עם `SELECT *`, ועוד סריקה של מנוע ההמלצות, ספירת קטגוריות וספירת אנשים), בלי שום cache, על תהליך Node יחיד ב-vCPU אחד: ~0.5s שרת בפרודקשן, ו-8 בקשות במקביל = 619ms כל אחת. זה ה-TTFB (p50 780ms).
- תמונות מועמדים: 330px מקוריות (2.8MB, 73 קבצים) מצוירות ב-44px, בלי כותרות cache. דף הבית מוריד 310KB תמונות.
- פונט Heebo עם fallback שנכשל באנדרואיד → reflow; קובץ `symbols` של 23KB בגלל שני סימנים.
- השלד של דף הבית קצר ב-72px מההירו → CLS.
- **אין גיבוי למסד הנתונים.** בכלל. Volume אחד, בלי snapshot.

### 4.6 חשיפה אורגנית

- ~55% מדפי השאלות בלי קישור פנימי נעקב (״הצגת עוד״ הוא `nofollow`, 12 בעמוד).
- אין דפי מועמד/מפלגה — השאילתות שאנשים מקלידים (״נתניהו״, ״איזנקוט״, ״ליכוד״) בלי דף נחיתה. 74 אנשים ב-`data/people.json`, כולם עם ערך ויקיפדיה ו-73 עם תמונה.
- `og.png` הכללי 303KB — על סף התקרה של WhatsApp לתצוגה מקדימה. דווקא הקישורים שהכי משתפים.
- `og:title` של שאלה = כותרת + ״| בחירות מרקט״, ממוצע 82 תווים → נחתך בצ׳אט לפני התאריך.

### 4.7 מדידה

- היומן עמוק יום וחצי. שום שיעור לא יציב עדיין.
- אין חותמת בנייה (commit) על האירועים ואין מנגנון A/B — אי אפשר להשוות לפני/אחרי בניקיון.
- אין אירוע ״כרטיס הוצג״ בחפיסה — יש מונה תשובות ואין מכנה.
- הרבה props נאספים ולא מסוכמים (`webview`, `first`, `install_app.action`, `login_error.error`).

---

## 5. תוכנית העבודה — תשע חזיתות

לכל משימה: **מזהה** (לציטוט ביומן), מאמץ (S ≤ חצי יום, M ≤ 2 ימים, L יותר), **מבצע**
(אתה / Claude Code / 🛑 בעל האתר), קבצים, ומדד. הסדר בתוך כל חזית הוא סדר הביצוע. הסדר בין
החזיתות: **A ו-B ו-C בשבוע הראשון, במקביל; D–F בשבועיים הראשונים; G–I מהשבוע השני.**

### A. אמון — לסגור את הסתירות לפני שמישהו מוצא אותן (P0)

הנימוק: האתר פוליטי, בתקופת בחירות, ומבקש מאנשים להאמין למד ״מה השחקנים חושבים״. כל מה שנבנה
על מספרים שסותרים את דף ההסבר יתמוטט ברגע שעיתונאי, מתחרה או משתמש אחד ישווה.

| מזהה | משימה | מאמץ | מבצע | קבצים | מדד |
|---|---|---|---|---|---|
| A1 | **לנטרל את ההכרעה האוטומטית של המחולל:** תוצאות בסטטוס resolved שחוזרות מ-`generate.ts` נכנסות לריצת `propose` ב-`data/resolutions/` ולא ל-`upsertMarkets`; `settleMarket` נקרא רק אחרי `isApproved()`. | S | Claude Code | `src/lib/agent/generate.ts`, `src/lib/sync.ts`, `src/lib/resolution.ts`, `scripts/test-resolution.ts` | 0 הכרעות ללא אישור (בדיקה) |
| A2 | **להחזיר את מה ש-`/about` מבטיח על הגרף:** לא למחוק את הסימון `synthetic` ב-`display-history.ts`; הגרף מצייר קו מקווקו + תווית ״אומדן״ עד העסקה האמיתית הראשונה; לסמן גם נקודות drift. | S | Claude Code | `src/lib/display-history.ts`, `src/components/PriceChart.tsx`, `src/components/RapidSpark.tsx` | הגרף של שאלה חדשה מציג ״אומדן״ |
| A3 | **להחיות את אזהרת ״מחיר ראשוני״:** הבדיקה `THIN_MARKET_TRADES` משווה למספר העסקאות **האמיתי**, לא למפוברק. הקופי: ״ההערכה של המערכת: 22% · עדיין אין תשובות״. | S | Claude Code | `src/app/market/[slug]/page.tsx`, `src/components/MarketCard.tsx`, `src/lib/fake-market-stats.ts` | האזהרה מופיעה על 284 השאלות הריקות |
| A4 | **לסמן שורות מומצאות:** ״תשובות אחרונות״ בדף השאלה מציג רק שורות אמיתיות (או מסמן ״הדגמה״); `/activity` — `noindex` + סימון; שורת גילוי אחת ב-`/leaderboard` (״הלוח כולל שחקני הדגמה״); להסיר את נתיב הקוד מהטקסט ב-`/about`. | S | Claude Code | `src/components/TradeList.tsx`, `src/app/activity/page.tsx`, `src/app/leaderboard/page.tsx`, `src/app/about/page.tsx` | 0 סתירות |
| A5 | **להפסיק לנפח את ה-API הציבורי:** `/api/markets` ו-`llms.txt` מחזירים `volume`/`tradeCount` אמיתיים. | S | Claude Code | `src/app/api/markets/route.ts`, `src/lib/llms-txt.ts` | diff מול `/admin` = 0 |
| A6 | **דירוג לפי רווח/הפסד ממומש + Brier, לא לפי שווי כולל;** שווי כולל נשאר בדף הניקוד. הבונוס לא משפיע על מקום. | M | Claude Code, אחרי ⚠️ אישור לכלל | `src/lib/portfolio.ts`, `src/lib/stats.ts`, `src/app/leaderboard/page.tsx` | דירוג לא זז מ-drift/בונוס |
| A7 | **ערך פוזיציה לפי עסקה אחרונה ולא לפי drift** בחישוב הדירוג (`price_history.source='trade'`). | S | Claude Code | `src/lib/portfolio.ts`, `src/lib/market-drift.ts` | |
| A8 | **גילוי על מודל שפה:** נוסח ל-`/about` §6 ול-`/terms` §4 (״נכתבות ומוכרעות בסיוע מודל שפה ומאושרות על ידי אדם״). אתה מכין, 🛑 הבעלים מאשר. | S | אתה → 🛑 | `src/app/about/page.tsx`, `src/app/terms/page.tsx` | |
| A9 | **ההחלטה הגדולה:** להסיר את `fake-market-stats`/`display-stats`/`fake-leaderboard` לגמרי ולהציג מספרים אמיתיים במסגור ״חדש״. הכן מסמך של עמוד: מה ייראה ריק, מה נציג במקום (״ההערכה של המערכת״, ״היו הראשונים״), ומה הסיכון בלהשאיר. | M | אתה → 🛑 | | |

**מה לא לעשות:** לא להוסיף ״הדגמה״ בכל מקום ולהמשיך כרגיל — התיוג הוא המינימום, לא היעד.

### B. מדידה — הכלים שהלולאה צריכה (P0)

| מזהה | משימה | מאמץ | מבצע | קבצים | מדד |
|---|---|---|---|---|---|
| B1 | **חותמת בנייה:** `NEXT_PUBLIC_BUILD_SHA` כ-build-arg ב-`deploy.yml` וב-`Dockerfile`; נחשף ב-`/api/health`, ב-`meta.build` של החבילה, וכ-`props.build` על כל pageview. | S | Claude Code | `.github/workflows/deploy.yml`, `Dockerfile`, `src/app/api/health/route.ts`, `src/lib/bundle.ts`, `src/components/Analytics.tsx` | כל מספר ניתן לפילוח לפי בנייה |
| B2 | **דלי A/B:** עוגייה `bm_exp=a\|b` ב-middleware (90 יום), `props.exp` על כל אירוע, `getExperiment(r)` שמפצל את המשפך הכללי והממומן לפי דלי, מפתח `experiments` בחבילה. רכיבי שרת קוראים את העוגייה ומרנדרים את הווריאנט. | M | Claude Code | `src/middleware.ts`, `src/lib/track.ts`, `src/lib/stats.ts`, `src/lib/bundle.ts`, `scripts/test-paid-funnel.ts` | ניסוי ראשון: סדר הסעיפים בדף הבית (F7) |
| B3 | **טלמטריית חפיסה:** `rapid_seen` (כרטיס הפך לעליון: `marketId`, `pos`, `loggedIn`) ו-`rapid_session` ביציאה (`shown/answered/skipped/seconds/guest`); שאילתות ״השלמה לכל שאלה״ ו״עומק ריצה״ (איפה ריצת אורח מתה מול 3 ו-10). | M | Claude Code | `src/components/RapidDeck.tsx`, `src/lib/events.ts`, `src/lib/stats.ts` | היסטוגרמת עומק ריצה |
| B4 | **שימור לפי מקור + זמן לתשובה ראשונה:** `getRetentionBySource` (קמפיין / הזמנה / אורגני, D1 ו-D7) ו-`getTimeToFirstTrade` (חציון דקות). | S | Claude Code | `src/lib/stats.ts`, `src/lib/bundle.ts`, `/admin/users` | שתי שורות בטבלת המדדים |
| B5 | **פילוחי props קיימים:** `pageview.first` (חדש/חוזר), `pageview.webview` (דפדפן in-app — Google מסרב לחלקם!), `install_app.action×platform`, `trade_error.reason`, `login_error.error`, `survey.status`, `guest_gate.n`. להוסיף `webview`/`lang` גם לשורת `landing` בשרת. | S | Claude Code | `src/lib/stats.ts`, `src/app/welcome/page.tsx` | |
| B6 | **לתקן את המשפך הכללי למצב זריז:** שלב ״ראו שאלה״ = דף שאלה **או** `/rapid`; שלב ״ענו בחפיסה״; `conversion` לכל שאלה לא יעלה על 100%. | S | Claude Code | `src/lib/stats.ts` | |
| B7 | **ייחוס שיתוף:** `ShareButton` מוסיף `?ref=share&s=native\|copy` (לא `utm_source`, כדי לא להיספר כממומן); `getShareLoop` שיתופים → נחיתות → הרשמות. | S | Claude Code | `src/components/ShareButton.tsx`, `src/components/Analytics.tsx`, `src/lib/stats.ts` | |
| B8 | **ניתוח מסלולים:** ״מה העמוד הבא אחרי X״ ו-3 המסלולים הנפוצים, מצרפי בלבד. | M | Claude Code | `src/lib/stats.ts`, `src/lib/bundle.ts` | |
| B9 | **GA4:** לרשום מאפיינים מותאמים `lang`, `webview`, `content`, `surface`, `exp`, `build`; ליצור Exploration של משפך ושל שימור. **בדפדפן, אתה.** | S | אתה | | |
| B10 | **Vitals לפי מכשיר ונתיב** (LCP/INP p75 בנייד בלבד) + כלל אזהרה ל-INP > 200 ב-`/rapid`. | S | Claude Code | `src/lib/stats.ts` | |

### C. מה עושים בשבוע שאחרי הפריסה של #95 והקמפיין (P0)

| מזהה | משימה | מבצע |
|---|---|---|
| C1 | **יום 1:** `/api/health` → `analytics.lastEventAt` מתקדם; ב-GA4 Realtime לראות `guest_answer`, `guest_soft_ask`, `landing`; לפתוח `/admin/traffic?days=1` ולוודא שהמשפך הממומן מתמלא. אם `paid` חסר בחבילה — הפריסה לא נחתה. | אתה |
| C2 | **ימים 1–7:** בכל בוקר `?days=1`: `paid_touched/paid_sessions` (היעד: מ-11% ל-35%+), `paid_deck/paid_sessions`, `guest_soft_ask` מול לחיצות `rapid-soft-ask-google` ו-`rapid-soft-ask-later`, `landing` מול `paid_sessions` (הפרש > 30% = בעיית טעינה/חוסמים, לא שכנוע), `login_error`, `clientErrors`. לכתוב ביומן. | אתה |
| C3 | **בקמפיין (לפי הרשאות `ads/COWORK-BRIEF.md`):** CTA ״מידע נוסף״ במקום ״הרשמה״; להסיר נכסים עם ״10,000 נקודות במתנה״ / ״ניחושים״ / ״מה יקרה״ / ״כל שעה״; סיומת URL אחת ברמת הקמפיין עם `utm_content={adgroupid}`; `sign_up` המרה ראשית ו-`first_trade` משנית עד שיש 15+ המרות; לכבות מיקוד אופטימלי; לפצל קבוצות עברית/אנגלית; דוח מיקומים ותדירות. **תקציב והצעות — רק בהצעה.** | אתה (🛑 לתקציב/פרסום) |
| C4 | **`scripts/ads-creatives.ts`** עודכן לניסוחים המאושרים — להריץ `npm run ads:creatives -- --set=generic --png` ולהחליף נכסים חלשים בדירוג ״נמוך״. | אתה |
| C5 | **שגיאות התחברות:** אם `login_error` או `webview` גבוהים — הסיבה הסבירה: דפדפן in-app (Instagram/Facebook) ש-Google מסרב לו. הפתרון: זיהוי webview והצגת ״פתחו בדפדפן״ עם קישור — תדריך ל-Claude Code. | אתה → Claude Code |

### D. הלוח: פחות שאלות, קצרות יותר, מוכרעות בזמן (P1)

הנימוק: 56% מהשאלות הקצרות נסחרות, 19% מהארוכות. ״תדעו אם צדקתם עד מחר״ היא ההבטחה היחידה
שמשחק חיזוי יכול לתת וחידון לא. הלוח היום מפר אותה ב-59% מהמקרים.

| מזהה | משימה | מאמץ | מבצע | קבצים | מדד |
|---|---|---|---|---|---|
| D1 | **ניקוי חד-פעמי:** רשימת כל השאלות הפתוחות עם 0 עסקאות ו-`closesAt` > 30 יום (≈180) → הצעת ביטול (CANCELLED, אף אחד לא מפסיד) → 🛑 אישור אחד → ביצוע דרך `npm run resolve` (לא ידנית). שאלות טובות מהן — להנפיק מחדש אחרי 15.10 עם מועדים קרובים. | M | אתה מכין → 🛑 → Claude Code מבצע | `data/markets.json`, `scripts/resolve.ts` | פתוחות ≤80 |
| D2 | **תקרת לוח ב-`AGENT.md` וברוטינה:** ≤60–80 פתוחות; ≤6 שאלות ״לוח גדול״ ארוכות; ״אחת נכנסת, אחת יוצאת״; `markets:audit` מחזיר ERR מעל התקרה. | S | אתה (מסמכים) + Claude Code (audit) | `AGENT.md`, `.claude/routines/questions.md`, `scripts/audit-markets.ts` | |
| D3 | **מדיניות `closesAt`:** מועד הסגירה = הרגע שבו הראיה פומבית **וקיימת ריצת הכרעה** — סקרי מוצאי שבת נסגרים למחרת ב-10:00, לא ב-23:59; להוסיף ריצת הכרעות ב-04:00 UTC (07:00 ישראל); ERR ב-audit אחרי 3 שעות איחור במקום 24; `propose` רץ תמיד `--from-server` ומדלג על מה שכבר לא פתוח בשרת; רוטינת ההכרעות מחזירה את המצב ל-`main` באותו יום. | M | אתה (מסמכים + טריגר) + Claude Code | `.claude/routines/resolve.md`, `scripts/resolve.ts`, `scripts/audit-markets.ts` | חציון שעות להכרעה |
| D4 | **תמהיל מועדים לכל ריצה:** ≥50% נסגרות ≤48 שעות, השאר ≤14 יום; שום דבר מעל 30 יום מחוץ ללוח הגדול. | S | אתה | `AGENT.md` (תמהיל מועדים) | % שאלות חדשות ≤72h |
| D5 | **נזילות לפי אופק:** `b=500` ל-≤48h, `1000` ל-≤14d, `2000` רק ללוח הגדול; לכייל את `elasticity.ts` על `RAPID_DEFAULT_STAKE=20` (היום הוא מכויל על ״לוויתן״ של 1,000 — פי 10 מהתקרה, סכום שאי אפשר להמר מאז שנקבעה תקרת 100; להוריד ל-5×MAX_BET). חל רק על שאלות חדשות (נזילות נכתבת פעם אחת). | S | Claude Code | `src/lib/elasticity.ts`, `scripts/liquidity.ts`, `.claude/skills/market-questions/references/liquidity.md`, `AGENT.md` | חציון תזוזה לעסקה (היום ≤1 נק׳) |
| D6 | **ההמלצות מעדיפות את הלילה על פני אוקטובר:** `appealBoost × max(0.4, urgency)`; +0.8 ל-≤48h; 5 הכרטיסים הראשונים של אורח בלי `closesAt` > 14 יום; ענישה על אותו אדם ברצף (לא רק אותה קטגוריה). | S–M | Claude Code | `src/lib/recommendations.ts`, `src/lib/rapid-feed.ts`, `scripts/test-recommendations.ts` | % תשובות אורח על שאלות ≤72h |
| D7 | **שאלת היום:** ריצת הבוקר מייצרת בדיוק אחת (topicality ≥4, נסגרת ≤36h, 0.30–0.70, כותרת ≤80, subtitle חובה), מסומנת; מוצגת בהירו של `/`, ב-`/welcome`, וככרטיס 1 בחפיסה; ריצת הכרעה מובטחת תוך שעתיים מסגירתה. | M | אתה (רוטינה) + Claude Code (שדה + הצגה) | `.claude/routines/questions.md`, `src/lib/content.ts`, `src/app/(listing)/page.tsx`, `src/lib/welcome-pick.ts`, `src/lib/rapid-feed.ts` | חזרה תוך 48h מהכרעה |
| D8 | **בדיקות איכות מכונה:** הכלה (שאלה רחבה ⊃ צרה באותו חלון) = ERR; ארכיטיפים אסורים = WARN (״ידווח כי״, ״יתייחס/יגיב/יבהיר״, ״מפלגה נוספת/גורם/בכיר״, מצב דף חי ברגע נתון, אירועים כמעט-יומיים); רצועת הזהב 0.15–0.85 נאכפת במיזוג; כותרת ≤95 קשיח; subtitle חובה ל-≤7d; רשימת מקורות לבנה מלאה + ERR על ויקיפדיה/hebcal כמקור מכריע יחיד. | M | Claude Code | `scripts/audit-markets.ts`, `scripts/merge-markets.ts`, `src/lib/similarity.ts`, `src/lib/content.ts`, `.claude/skills/market-questions/references/validation.md` | ביטולים ל-100 שאלות < 1 |
| D9 | **תקציב אנשים:** ≤1 שאלה לאדם בריצה; נתניהו ≤25% מהלוח (היום 44%). | S | אתה | `AGENT.md` | |
| D10 | **פורמט הודעת הכרעה:** השורה הראשונה של `resolutionNote` = התשובה, מתוארכת, ≤120 תווים; אחר כך ציטוט + URL. זה מה שיהפוך לכרטיס תוצאה, ל-OG ולרצועת ״הוכרעו אתמול״. | S | אתה (מסמך) + Claude Code (בדיקה ב-`resolution.ts`) | `.claude/skills/market-resolutions`, `src/lib/resolution.ts` | |
| D11 | **פער מסמכים↔טריגרים:** `questions.md` מתעד `0 6,9,12,15,19 UTC`, הטריגר החי רץ `9,12,15,19,22 UTC` (01:00 בלילה, בלי ריצת בוקר). ליישר: ריצת בוקר 06:00 UTC, לבטל את 22:00. `AGENT.md` עדיין אומר ״פעם בשעה״. | S | אתה (Routines + מסמכים) | | |
| D12 | **לתקן עכשיו (רשימת slugs בנספח ד׳):** עבר-מועד, הכלה, מעורפלות, מחוץ ל-5–95%, ״מיועדות לביטול״. | S | אתה מציע → 🛑 | | |

### E. סיבה לחזור (P1)

| מזהה | משימה | מאמץ | מבצע | קבצים | מדד |
|---|---|---|---|---|---|
| E1 | **״מאז הביקור הקודם״** בלי תשתית חדשה: `positions.updatedAt` > ה-pageview האחרון של המשתמש → נקודה על צ׳יפ הניקוד בהדר עם דלתא; כרטיס עליון ב-`/portfolio` (״מאז הביקור: 3 הוכרעו · +412״); שורה ב-`/rapid` לפני החפיסה. | M | Claude Code | `src/lib/portfolio.ts`, `src/components/PortfolioValue.tsx`, `src/app/portfolio/page.tsx`, `src/app/rapid/page.tsx` | אירוע חדש `resolution_seen`; D1 |
| E2 | **סוף ריצה לשחקן מחובר:** ״X מהתשובות שלך מוכרעות עד מחר · Y עד סוף השבוע״ (מ-`closesAt` של הכרטיסים שנענו); הצעת התקנה (״כדי לדעת מתי צדקתם״); שורת הזמנה עם הקישור האישי. | S–M | Claude Code | `src/components/RapidDeck.tsx` (RunSummary), `src/app/rapid/page.tsx`, `src/components/InstallApp.tsx` | `install_app` לפי `surface`; קליקים `summary-invite-*` |
| E3 | **הזמנה ברגעים הנכונים ומדודה:** `data-evt` על כפתורי `InviteCard` (`invite-copy/whatsapp/share`); שורת הזמנה במסך ההצלחה של `TradePanel`; `?ref=<code>` על כל שיתוף של משתמש מחובר + middleware שקורא `ref` בכל נתיב (גם `/l/:code`); דף `/i/<code>` מציג את הדירוג של המזמין. | M | Claude Code | `src/components/InviteCard.tsx`, `src/components/ShareButton.tsx`, `src/components/TradePanel.tsx`, `src/middleware.ts`, `src/app/i/[code]/page.tsx`, `src/lib/events.ts` | `referral_claimed` > 0 |
| E4 | **הסבב של היום:** פרוסת חפיסה של ~10 = חדשות מאז הביקור + נסגרות ≤48h + topicality; טבעת התקדמות; ״סיימתם את הסבב של היום — מחר יש חדש״; שער הכניסה אישי למחובר (״מאז הביקור: 12 חדשות · 3 שלך הוכרעו (+140)״). | M | Claude Code | `src/lib/rapid-feed.ts`, `src/components/RapidDeck.tsx`, `src/components/RapidEntryGate.tsx` | תשובות למשתמש ליום נפרד |
| E5 | **PWA:** `start_url` ל-`/rapid`; הצעת ההתקנה עוברת מסוף דף הבית לסוף ריצה / אחרי תשובה ראשונה עם קופי על הכרעות. | S | Claude Code | `src/app/manifest.ts`, `src/components/InstallApp.tsx` | `accepted/shown` |
| E6 | **Web push** על `settleMarket` למחזיקים (handler ב-`sw.js`, טבלת מנויים, בקשת הרשאה במסך הסיכום בלבד); אחר כך דיג׳סט אימייל יומי 08:00 (Google נותן אימייל מאומת; אין ספריית דואר היום). | L | Claude Code, אחרי E1–E5 | `public/sw.js`, `src/lib/db/schema.ts`, `src/lib/trade.ts`, cron | חזרה תוך 24h מהכרעה |
| E7 | **דף הבית למחובר:** רצועת ״המצב שלך״ למעלה (דלתא, N מוכרעות היום, N הוכרעו מאז הביקור) ו-״הוכרעו לאחרונה״ מעל הרשימה. | M | Claude Code | `src/app/(listing)/page.tsx`, `src/lib/portfolio.ts` | נטישה של מחוברים בדף הבית |
| E8 | **הניקוד:** מיון פוזיציות פתוחות לפי `closesAt`; קבוצת ״נסגר היום״; כפתור ״לנעול +X״ כשיש רווח; ״ממתין להכרעה״ במקום ״נסגר״; ״הוחזרו״ נפרד מ-״הוכרעו״ לביטולים. | S | Claude Code | `src/app/portfolio/page.tsx`, `src/lib/portfolio.ts` | חלק המכירות (היום 3/136) |
| E9 | **לאחד את שני מנגנוני ההזמנה:** הרשמה דרך `/i/<code>` מוסיפה חברות אוטומטית ומצרפת לליגת ברירת המחדל של המזמין; בלוח הציבורי שורת ״מול חברים: מקום 1 מתוך 3״. | M | Claude Code | `src/lib/referral-program.ts`, `src/lib/friends.ts`, `src/lib/leagues.ts` | % משתמשים עם ≥1 חבר |
| E10 | **לדלג על השאלון** למי שכבר יש לו תשובות אורח או פוזיציות; במקום: מסך ״N התשובות שלך נכנסו — הנה מתי הן מוכרעות״. | S | Claude Code | `src/lib/after-login.ts`, `src/app/onboarding/page.tsx`, `src/components/RapidGuestSync.tsx` | זמן להתשובה השנייה |

### F. הפעלה ראשונה: המסך הראשון ואוצר המילים (P1)

| מזהה | משימה | מאמץ | מבצע | קבצים | מדד |
|---|---|---|---|---|---|
| F1 | **שער הכניסה:** לא ב-`/market/*` ולא ב-`/category/*` (מי שהגיע מקישור בא לשאלה); בדף הבית — גיליון תחתון לא-חוסם או פתיחה רק אחרי `load`+idle כדי לא להיות ה-LCP; כפתור סגירה ≥44px. | S | Claude Code | `src/lib/entry-gate.ts`, `src/components/RapidEntryGate.tsx` | LCP דף שאלה; `entry-gate-dismiss` |
| F2 | **דף שאלה: כן/לא מעל הגרף,** גרף מקופל לספארקליין; סף ל-`IntersectionObserver` של הסרגל הדביק (`threshold: 0.4`). | M | Claude Code | `src/app/market/[slug]/page.tsx`, `src/components/StickyTradeBar.tsx` | `trade_intent` מדף שאלה |
| F3 | **אוצר מילים אחד** (נספח ה׳): ״הסיכוי ל״כן״״ בכל מקום; ״ניקוד אם צדקתם״ במקום ״תשלום אם צדקת״; להוריד את שורת ה-״%+״; ״תשובה״ במקום ״אחיזה״/״יחידות״; להסתיר את לשונית ״החזרה״ למי שאין פוזיציה; פנייה ברבים בכל האתר; בלי לוכסנים (״ענה/תה״). | M | Claude Code (אתה מכין את המילון) | `src/components/TradePanel.tsx`, `src/lib/format.ts`, `src/components/PriceChart.tsx`, `src/components/RapidSpark.tsx`, `src/components/ActivityFeed.tsx`, `src/app/about/page.tsx` | |
| F4 | **״נק׳״ רק לנקודות משחק;** שינוי במד = ״▲1.7%״ או ״מ-38% ל-40%״. | S | Claude Code | `src/components/PriceChart.tsx`, `src/components/RapidSpark.tsx` | |
| F5 | **סכום מעל התקרה** נחסם בשדה עם התקרה בתוכו; צ׳יפים הם ערכים מוחלטים עם מצב נבחר. | S | Claude Code | `src/components/TradePanel.tsx` | `trade_error.reason` |
| F6 | **כפתורי הכרטיס ״כן 40% / לא 60%״** מובילים לתשובה מיידית (לחפיסה על השאלה הזאת) או מסומנים ״לענות כן / לענות לא״. | S–M | Claude Code | `src/components/MarketCard.tsx` | הקשות עד תשובה ראשונה |
| F7 | **סדר דף הבית:** צ׳יפים ורשימה קודם; הזמנה/התקנה/״איך משחקים״ אחרי הרשימה. **זה הניסוי A/B הראשון** (B2). ההירו: הבאדג׳ העריכתי יורד לכיתוב מתחת, בלי ״343״ שלוש פעמים. | M | Claude Code | `src/app/(listing)/page.tsx`, `src/components/AgentBadge.tsx` | נטישה בדף הבית; `hero-rapid` |
| F8 | **יעדי מגע** ≥44px: ״דלג״/״פרטים״ בחפיסה, צ׳יפים בפוטר, קישורים ב-`/about`; שורות `/activity` כקישור שלם. | S | Claude Code | `src/components/RapidDeck.tsx`, `src/components/Footer.tsx`, `src/components/ActivityFeed.tsx` | |
| F9 | **לוח המובילים:** שורות בשתי קומות (כינוי מלא), ״שערוך״ → ״רווח משוער״, ההסבר בשורה אחת + פרטים. | M | Claude Code | `src/app/leaderboard/page.tsx` | |

### G. מהירות ותשתית (P2, אבל G1 ו-G10 דחופים)

| מזהה | משימה | מאמץ | מבצע | קבצים | מדד |
|---|---|---|---|---|---|
| G1 | **Cache ללוח:** TTL 30–60 שניות בזיכרון לחבילת דף הבית של אורח (`markets, stats, counts, peopleCounts, closingSoon, recentlyResolved, guestRecommendations`) לפי `(sort,status,q,person)`; מחוברים משתמשים ברשימה מה-cache ומחשבים רק המלצה אישית; `listMarkets` בוחר רק עמודות כרטיס (בלי `description`/`resolutionCriteria`). | S–M | Claude Code | `src/lib/board-cache.ts` (חדש), `src/app/(listing)/page.tsx`, `src/lib/markets.ts`, `src/lib/recommendations.ts`, `src/app/category/[id]/page.tsx` | TTFB p50 780→<500ms; LCP בית 3.3→<1.8s |
| G2 | **תמונות מועמדים:** `scripts/fetch-people.ts` מייצר `people/thumb/<id>.webp` ב-96 ו-192px; `PeopleStack`/`MarketImage` עם `srcset`; להמיר 6 PNG כבדים; `headers()` ב-`next.config.ts`: `public, max-age=31536000, immutable` ל-`/people/*`, `/covers/*`, אייקונים. | S–M | Claude Code | `scripts/fetch-people.ts`, `src/components/PeopleStack.tsx`, `src/components/MarketImage.tsx`, `next.config.ts` | בייטים בדף הבית 645→~340KB |
| G3 | **פונטים:** `display: "optional"` (או `"fallback"`); SVG במקום `✕`/`▾` (מוריד 23KB); לשקול fallback ידני על Roboto. | S | Claude Code | `src/app/layout.tsx`, `src/app/globals.css`, `src/components/Header.tsx`, `src/app/rapid/page.tsx` | CLS p95 0.286→<0.1 |
| G4 | **שלד דף הבית** תואם להירו (`min-h` זהה, שורות כותרת שמורות); אחרי G1 — ההירו מעל גבול ה-Suspense. | S | Claude Code | `src/app/(listing)/loading.tsx`, `src/app/(listing)/page.tsx` | CLS |
| G5 | **Service worker:** `navigationPreload` + `preloadResponse` בענף ה-navigate. | S | Claude Code | `public/sw.js` | TTFB בביקור חוזר |
| G6 | **gtag ב-`/welcome`:** מזהה הקליק כבר נשמר בעוגייה ב-middleware — לדחות את הטעינה ל-`load`+idle גם שם, או לפחות `preconnect`; לאמת שהמרות עדיין מיוחסות. | S | Claude Code | `src/components/GoogleAnalytics.tsx`, `src/components/AdConversions.tsx` | LCP `/welcome` |
| G7 | **חפיסה:** 6–8 כרטיסים ב-SSR והשאר מ-API אחרי mount; ספארקליין רק ל-2 הראשונים בשרת. | M | Claude Code | `src/app/rapid/page.tsx`, `src/components/RapidDeck.tsx` | TBT; HTML 185→~90KB |
| G8 | **`price_history`:** עד ~16–20k כתיבות drift ביום. הדילול כבר קיים ועובד (`market-drift.ts`: אחרי 3 ימים שורה אחת ל-6 שעות), אז הגידול חסום — מה שחסר הוא הגבלת שאילתות הגרף ל-31 יום (יותר מזה לא נקרא ממילא) ואינדקס `(marketId, source, ts)` לתת-שאילתות של ה-drift, שסורקות טבלה מלאה כל 10 דקות. | M | Claude Code | `src/lib/markets.ts`, `src/lib/market-drift.ts`, `drizzle/`, cron | זמן רינדור `/rapid` יציב |
| G9 | **עבודות כבדות מחוץ לתהליך הווב:** קונטיינר ה-`cron` הקיים רק קורא ל-`/api/cron/refresh`, והמחולל עצמו (דקות של LLM וחיפוש) רץ בתוך `next start` על אותו vCPU שמרנדר עמודים — להעביר אותו להרצת `npm run markets:generate` בקונטיינר; `busy_timeout` ל-SQLite; `lb_try_duration` ב-Caddy כדי שפריסה לא תחזיר 502. | M | Claude Code | `docker-compose.yml`, `Caddyfile`, `src/lib/db/index.ts`, `src/app/api/cron/refresh/route.ts` | TTFB p95 |
| G10 | **גיבוי למסד הנתונים — אין היום.** `sqlite3 .backup` לילי מהמארח ל-DO Spaces (או Litestream), + גיבויי droplet. **לא לחכות עם זה.** | S | Claude Code (+ 🛑 פרטי אחסון) | `docker-compose.yml`, סקריפט חדש | קובץ גיבוי מאתמול קיים |
| G11 | **דחיסה וסטטי:** `compress: false` ב-Next ולתת ל-Caddy zstd; `og.png` 303KB → ≤100KB (גם SEO). | S | Claude Code | `next.config.ts`, `Caddyfile`, `public/og.png` | |

### H. חשיפה אורגנית ושיתוף (P2)

| מזהה | משימה | מאמץ | מבצע | קבצים | מדד |
|---|---|---|---|---|---|
| H1 | **`og.png` ≤100KB** (PNG פלטה או JPEG, 1200×630). חצי שעה. | S | Claude Code | `public/og.png`, `src/lib/seo.ts` | תצוגה מקדימה ב-WhatsApp |
| H2 | **`og:title` של שאלה = הכותרת בלבד;** `<title>` נשאר עם הסיומת; שדה `seoTitle` ≤60 תווים לרוטינה. | S/M | Claude Code + אתה (`AGENT.md`) | `src/app/market/[slug]/page.tsx`, `src/lib/content.ts` | |
| H3 | **קישורים נעקבים לכל שאלה:** להסיר `nofollow` מ-״הצגת עוד״; רשימת טקסט קומפקטית של כל השאלות הפתוחות בתחתית כל דף קטגוריה; 6 שאלות קשורות במקום 3; `nofollow` על קישורי `?side=`. | S–M | Claude Code | `src/components/MarketBrowser.tsx`, `src/app/category/[id]/page.tsx`, `src/app/market/[slug]/page.tsx`, `src/components/MarketCard.tsx` | דפים מאונדקסים ב-Search Console |
| H4 | **דפי מועמד `/person/[id]`:** תמונה, תפקיד, כל השאלות הפתוחות, רקורד הכרעות, `Person` JSON-LD עם `sameAs` ויקיפדיה, ב-sitemap; `PmCandidates` וצ׳יפים בדף השאלה מקשרים לשם. אחר כך `/party/[id]`. | M | Claude Code | חדש `src/app/person/[id]/page.tsx`, `src/lib/seo.ts`, `src/app/sitemap.ts` | ~65 דפי hub; קליקים אורגניים |
| H5 | **היגיינת sitemap:** `/?status=resolved` (0 הוכרעו, מציג ביטולים) → `/resolved` נקי; `/activity` noindex; להסיר invite/suggest/contact; `changeFrequency` daily; `dateModified` לא זז מעסקה. | S | Claude Code | `src/app/sitemap.ts`, `src/app/(listing)/page.tsx`, `src/lib/seo.ts`, `src/lib/trade.ts` | |
| H6 | **שיתוף שמביא חזרה:** טקסט ״ניחשתי כן · {כותרת}\n{url}״ עם `?ref=`; כפתור `wa.me` ליד ה-native sheet (ראו E3/B7). | M | Claude Code | `src/components/ShareButton.tsx` | שיתוף→ביקור |
| H7 | **`/feed.xml` + `/today`:** שאלות חדשות והכרעות; דף יומי עם התאריך ב-H1 (חדש היום, נסגר היום, הוכרע אתמול); `lastmod` אמיתי. | M | Claude Code | חדשים | Discover/אגרגטורים |
| H8 | **`/polls`:** טבלת הסקר האחרון לכל ערוץ (מנדטים לרשימה, תאריך, מקור) + ״מה השחקנים חוזים״ עם ״המד אינו סקר״. הדף היחיד שיכול לדרג ל-״סקרים בחירות 2026״. | L | Claude Code + רוטינה | | |
| H9 | **מדריכים:** ״מה זה משחק חיזוי ואיך המד נקבע״, ״מדריך לסקרי הבחירות 2026״, דף לכל רשימה גדולה. | M | אתה (טקסט) + Claude Code | `src/app/guide/*` | |
| H10 | **היגיינה:** 404 עם `robots noindex` אחד; תיאור קטגוריה ≤155; `robots.txt` לא חוסם `/api/markets` אם `llms.txt` מפרסם אותו; בדיקות ב-`test-seo.ts` על גודל OG, אורכי כותרת, sitemap בלי noindex. | S | Claude Code | `src/app/not-found.tsx`, `src/app/robots.ts`, `scripts/test-seo.ts` | |

### I. כלכלה, הוגנות, אבטחה וחוק (P2, חלקו 🛑)

| מזהה | משימה | מאמץ | מבצע | קבצים | מדד |
|---|---|---|---|---|---|
| I1 | **תקרת פוזיציה לכל משתמש לכל שאלה** (`MAX_POSITION_COST=500` → במקרה הגרוע 50%→61%) + תקרת הוצאה יומית (1,000). | S | Claude Code, ⚠️ אישור לערכים | `src/lib/trade.ts`, `src/lib/limits.ts`, `src/components/TradePanel.tsx`, `src/components/RapidDeck.tsx` | אף שחקן לא מזיז > 15 נק׳ |
| I2 | **הגבלות קצב על נקודות הכסף:** `/api/trade` ו-`/api/rapid/answer` (60/דקה/משתמש), `/api/comments` (10/שעה). | S | Claude Code | `src/app/api/trade/route.ts`, `src/app/api/rapid/answer/route.ts`, `src/app/api/comments/route.ts` | |
| I3 | **הזמנות:** לשלם רק אחרי הפוזיציה המוכרעת הראשונה של המוזמן (או 5 תשובות); תקרה 10; hash של IP/UA בהרשמה ודגל על >2 הרשמות מאותו IP ביום; ספירת הזמנות ב-`/admin/users`. | S–M | Claude Code, ⚠️ | `src/lib/referral.ts`, `src/lib/referral-program.ts`, `src/lib/auth.ts` | |
| I4 | **טוקנים:** `ROUTINE_TOKEN` נפרד ל-`/api/admin/markets` upsert בלי הכרעה; `timingSafeEqual`; issued-at בעוגיית האדמין. | S | Claude Code | `src/lib/api-auth.ts`, `src/lib/admin.ts` | |
| I5 | **ערעור והוכחה:** חלון 48 שעות `pending_resolution` לפני `settleMarket`; ראיות כקישורים עם תג מקור; `data/resolutions/*.json` פומבי בדף השאלה; מחיקת תגובות באדמין. | M | Claude Code, ⚠️ | `src/lib/trade.ts`, `src/lib/sync.ts`, `src/app/market/[slug]/page.tsx`, admin | |
| I6 | **כלכלה קוהרנטית (הצעה לדיון):** יתרת פתיחה 1,000, תקרה 100, קצבה יומית +100 בביקור, עונות ליגה שבועיות לפי רווח ממומש, עמודת ״דיוק״. **🛑 החלטה של הבעלים** — אתה מכין ניתוח של עמוד עם השלכות. | M | אתה → 🛑 | | |
| I7 | **משפטי:** זהות המפעיל + אימייל ב-`/terms` ו-`/privacy` (`CONTACT_EMAIL` ריק היום); לתקן ב-`/privacy` את המשפט ״שם התצוגה, התמונה והפעילות שלכם גלויים לכל מבקר בלוח המובילים״ — הלוח אנונימי, ודף הלוח עצמו אומר זאת; סעיפים על מספרי הדגמה ומודל שפה; Consent Mode v2 (ברירת מחדל denied + באנר שורה) — **🛑 הבעלים מחליט על הנוסח והזהות.** | S–M | אתה מכין → 🛑 → Claude Code | `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/lib/config.ts`, `src/components/GoogleAnalytics.tsx` | |
| I8 | **תעמולת בחירות:** `pollBlackoutFrom = 2026-10-23` — מ-23.10 שאלות מנדטים/אחוזי הצבעה מציגות ״מוסתר עד יום הבחירות״ + ״אינו סקר בחירות״ בכל דף שאלה; שורת ״מי מפעיל ומי מממן״ ב-`/about`. **להכין עד 10.10.** | S–M | Claude Code + 🛑 נוסח | `src/lib/config.ts`, `src/app/market/[slug]/page.tsx`, `src/components/MarketCard.tsx`, `src/app/about/page.tsx` | |
| I9 | **מודל זהות אחד ללוח:** ״הצג את שמי״ opt-in או עיגול שווי ל-50 כדי שאי אפשר יהיה לחבר שורה ציבורית לשורה בליגה; ליישר את `/privacy`. | S | Claude Code, ⚠️ | `src/lib/fake-leaderboard.ts`, `src/app/leaderboard/page.tsx`, `src/app/privacy/page.tsx` | |

---

## 6. הלוח השבועי והדיווח

### יומי (10 דקות, בבוקר)

1. `GET /api/health` — `analytics.lastEventAt` מהיממה האחרונה, `lastAgentRun` טרי.
2. `/admin?days=1` → `issues`. כל `overdue-markets` = לפתוח `npm run resolve -- propose --from-server`, להכין את הראיות, ולשלוח לבעלים לאישור (לא להכריע).
3. `performance.clientErrors[0]` ו-`login_error` — כל שגיאה חדשה נכנסת ליומן עם השערה.
4. אם הייתה פריסה אתמול: פרוטוקול הרגרסיה (למטה).

### שבועי (יום ראשון: תכנון · ימים ב׳–ד׳: ביצוע · יום חמישי: מדידה ודיווח)

1. **משוך** `days=7` (json + md) ואת דוחות Google Ads לפי קבוצה/נכס/מיקום. שמור את ה-json תחת `ops/data/YYYY-MM-DD.json` (מצרפי, בלי PII — מותר).
2. **מלא את טבלת המדדים** מסעיף 0 עם ערכי השבוע, לצד השבוע הקודם.
3. **בחר 3–5 משימות** מסעיף 5 לפי הכלל: קודם מה שחוסם מדידה (B), אחר כך מה שמתקן אמון (A), אחר כך המנוף הכי גדול לפי הנתונים של השבוע. משטח אחד — שינוי אחד.
4. **כתוב תדריכים** ל-Claude Code (נספח ו׳) והנח אותם ב-`ops/briefs/YYYY-MM-DD-<מזהה>.md`.
5. **ודא** כל PR שנפתח: CI ירוק, צילומי לפני/אחרי בנייד, בדיקה באתר החי אחרי הפריסה.
6. **ביום חמישי דווח** בפורמט הזה, בדיוק:

```
שבוע N (תאריכים) · פריסות: <רשימת PR>
שחקנים פעילים שבועיים: N (שבוע שעבר N)
נחיתה→נגעו: X% (n=) | נחיתה→חפיסה: X% | הרשמה→תשובה באותו יום: X% | D1: X% | D7: X%
לוח: פתוחות N · חוב הכרעות N · חציון שעות להכרעה N · שאלות חדשות ≤48h: X%
מהירות: LCP p75 Ns · TTFB p50 Nms · CLS p95 N
קמפיין: הוצאה ₪X · first_trade N (₪Y) · sign_up N (₪Y) · הכי טוב/הכי גרוע: <קבוצות>
עשיתי: <רשימת מזהים>
למדתי: <משפט לכל שינוי: המדד זז / לא זז, ומה המסקנה>
מבקש אישור ל: <רשימת 🛑/⚠️, או "כלום">
השבוע הבא: <3–5 מזהים>
```

### פרוטוקול רגרסיה אחרי פריסה

- שעת המעבר = סיום ריצת ״Deploy to server״ ב-GitHub Actions (היא מחכה ל-`/api/health`).
- מיד: `/api/health`; GA4 Realtime מראה `guest_answer`/`trade`/`sign_up` (לפי מה שנוגע).
- אחרי 24 שעות: `days=1` מול `days=1` של אתמול: `paid_touched/paid_sessions`, `paid_deck/paid_sessions`, `paid.landing.medianSeconds`, נטישת `/rapid`, LCP/INP p75, `clientErrors`, `trade_error`, `login_error`. כל `issues` חדש מבין `no-events`, `client-errors`, `slow-lcp`, `paid-no-touch`, `paid-lost-before-js` = לחקור באותו יום.
- עד ש-B1 קיים, אף פעם לא משווים חלון שחוצה פריסה.
- רגרסיה ברורה (שגיאות חדשות, מדד הפעלה נופל ב->30% עם n≥50) → PR של revert מיידי, ואז לחקור. revert הוא לא כישלון.

---

## 7. איך מחליטים

- **ניקוד:** לכל מועמד — השפעה צפויה על מדד הצפון (1–5) × ביטחון בראיות (1–5) ÷ מאמץ (S=1, M=2, L=4). שינויים שסוגרים חור מדידה או סתירת אמון מקבלים +3 אוטומטית. אל תעבוד על משהו עם ניקוד נמוך רק כי הוא קל.
- **מדגמים:** אחוז מצוטט רק עם n≥30 במכנה ועם n בסוגריים; ניסוי A/B מוכרע רק עם n≥100 סשנים לדלי **וגם** שבועיים; אם שני התנאים לא מתקיימים — ״עוד אין תשובה״ הוא דיווח לגיטימי.
- **סדר עדיפויות בין חזיתות כשיש קונפליקט:** אמון > מדידה > הלוח > חזרה > הפעלה > מהירות > SEO > כלכלה. חריג: G1 (cache) ו-G10 (גיבוי) לפני הכול אחרי A ו-B, כי האחד עוצר קריסה בעומס קמפיין והשני עוצר אובדן נתונים.
- **מתי עוצרים משימה:** שלושה שבועות בלי שהמדד שלה זז → כותבים ביומן ״לא עבד, כי…״ ועוברים הלאה. לא ״עוד שבוע״.
- **מתי מבטלים שינוי:** רגרסיה כמפורט למעלה, או תלונה של משתמש על משהו שהשינוי גרם (`/admin/inbox`).
- **מה שלא ברור:** אם שתי קריאות של המסמך הזה מובילות לעבודה שונה מהותית — עוצרים ושואלים, לא מנחשים.

---

## נספח א׳ — הגדרות מדדים והסתייגויות

| מונח | הגדרה במערכת | הסתייגות |
|---|---|---|
| מבקר | `sha256(salt‖ip‖ua‖day)` — דפדפן ביום נתון | סכימה על ימים סופרת חוזרים פעמיים; NAT + אותו דגם טלפון = מבקר אחד. משתמש מחובר מזוהה גם ב-`userId` — שימור של חשבונות מדויק, של אנונימיים לא. |
| סשן | `sessionStorage` = לשונית | ״פתח בדפדפן״ מ-in-app = סשן חדש בלי utm — סשן ממומן יכול למות שם בלי שהמשפך יראה. |
| סשן ממומן | ה-pageview הראשון נשא `medium` (utm_medium, או `cpc` כשיש gclid/gbraid/wbraid) | |
| נחיתה (`landing`) | שורה שנכתבה בשרת ברינדור `/welcome` עם פרמטר קמפיין | לפי בקשה (רענון = 2), בלי סשן. הפער ל-`paid_sessions` מערבב נטישה לפני JS, חוסמים, ורענונים. |
| נגעו (`paid_touched`) | סשן ממומן עם `click`/`search`/`guest_answer`/`share` | |
| נרשמו (`paid_signup`) | חשבונות עם `utmMedium` או `gclid` שנוצרו בטווח — **חשבונות, לא סשנים**; לכן אין אחוז מהשלב הקודם | |
| חזרו (`users.cohorts.returned`) | כל אירוע/עסקה >24 שעות אחרי ההרשמה | גס. D1/D7 אמיתיים — B4. |
| נטישה | סשן עם pageview אחד | `/welcome` מושך את הממוצע למעלה בכוונה. |
| ממוצע שניות בעמוד | ממוצע, יוצאים מעל שעה מסוננים, `page_exit` תלוי ב-`pagehide` (iOS מדלג לפעמים) | חסר-ספירה בנייד. |
| Web Vitals | p50/p75/p95 מהשדה, כלל-אתר | נייד ודסקטופ יחד עד B10. |
| בוטים | regex על UA + UA ריק; מכניס במכוון Telegram/DuckDuckGo/in-app | אין סינון IP. |
| מדינה | תמיד `??` (אין כותרת גיאו מאחורי Caddy) | `paid.languages` הוא התחליף. |
| GA4 מול מדידה עצמית | יחלקו: gtag עצל בנחיתות אורגניות, חוסמי פרסומות, המרות Ads יורות רק כשדפדפן מחובר מריץ את הבדיקה | המדידה העצמית היא הרצפה; הטבלאות העסקיות (`users`, `business`, `cohorts`) מדויקות. |

## נספח ב׳ — קטלוג האירועים (מה קיים ומה מתווסף)

קיים (`src/lib/events.ts`): `pageview`, `page_exit`, `click` (עם `props.id` מ-`CLICK_IDS`), `search`,
`share`, `outbound`, `web_vital`, `client_error`, `install_app`, `trade`, `trade_attempt`,
`trade_error`, `comment`, `signup`, `login`, `logout`, `survey`, `referral_claimed`, `rapid_gate`,
`league_create`, `league_join`, `friend_request`, `friend_accept`, `suggestion`, `contact_message`,
`bundle_download`, `landing`, `guest_answer`
(`surface=welcome|deck`, `side`, `stored`), `guest_soft_ask`, `guest_gate` (`n`, `soon`),
`guest_redeem`, `login_error`.

מזהי לחיצה שחשובים למשפך: `welcome-answer-yes/no`, `welcome-start`, `welcome-start-end`,
`welcome-login`, `header-login-quiet`, `rapid-soft-ask-google/login/later`, `rapid-guest-gate`,
`rapid-guest-gate-google`, `rapid-guest-gate-browse`, `rapid-summary-google`, `login-google`,
`rapid-skip`, `entry-gate-rapid`, `entry-gate-dismiss`, `hero-rapid`.

מתווסף בתוכנית: `rapid_seen`, `rapid_session` (B3), `resolution_seen` (E1), `props.build` (B1),
`props.exp` (B2), `invite-copy/whatsapp/share` ו-`summary-invite-*` (E2/E3), `props.surface` על
`install_app` (E5). מזהים בשימוש ובלי תווית היום (להוסיף ל-`CLICK_IDS`): `menu-preferences`,
`survey-prompt-open`, `survey-prompt-later`.

## נספח ג׳ — מפת הקוד לפי חזית

| חזית | קבצים מרכזיים |
|---|---|
| נחיתה ממומנת | `src/app/welcome/page.tsx`, `src/lib/welcome-pick.ts`, `src/components/WelcomeQuestions.tsx`, `src/components/HeaderLogin.tsx`, `src/middleware.ts` (עוגיות `bm_ad`), `src/lib/ad-attribution.ts`, `src/lib/ad-conversions.ts`, `src/components/AdConversions.tsx` |
| חפיסה ואורחים | `src/components/RapidDeck.tsx`, `src/app/rapid/page.tsx`, `src/lib/rapid.ts`, `src/lib/rapid-feed.ts`, `src/lib/rapid-guest.ts` (`GUEST_LIMIT=10`, `GUEST_SOFT_ASK=3`), `src/lib/rapid-skips.ts`, `src/components/RapidGuestSync.tsx`, `src/components/GuestRunBanner.tsx`, `src/components/RapidEntryGate.tsx`, `src/lib/entry-gate.ts` |
| התחברות | `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/lib/after-login.ts`, `src/lib/auth.ts`, `src/components/GuestCopy.tsx`, `src/components/GuestAnswersRecap.tsx`, `src/components/LoginError.tsx` |
| דף שאלה ומסחר | `src/app/market/[slug]/page.tsx`, `src/components/TradePanel.tsx`, `src/components/StickyTradeBar.tsx`, `src/components/PriceChart.tsx`, `src/components/TradeList.tsx`, `src/lib/trade.ts` (`executeTrade`, `settleMarket`), `src/lib/lmsr.ts`, `src/lib/limits.ts` (`STARTING_BALANCE=10000`, `MAX_BET=100`, `THIN_MARKET_TRADES=3`) |
| לוח ותוכן | `data/markets.json`, `data/people.json`, `src/lib/content.ts` (סכמה), `src/lib/sync.ts`, `src/lib/resolution.ts`, `scripts/resolve.ts`, `scripts/audit-markets.ts`, `scripts/merge-markets.ts`, `scripts/duplicates.ts`, `scripts/liquidity.ts`, `src/lib/elasticity.ts`, `src/lib/drift.ts`, `src/lib/market-drift.ts`, `src/lib/agent/generate.ts`, `src/lib/recommendations.ts`, `src/lib/appeal.ts`, `src/lib/topicality.ts` |
| מספרים מוצגים/מפוברקים | `src/lib/display-stats.ts`, `src/lib/display-history.ts`, `src/lib/synthetic-history.ts`, `src/lib/fake-market-stats.ts`, `src/lib/fake-leaderboard.ts`, `src/lib/fake-activity.ts` |
| שימור וחברתי | `src/lib/portfolio.ts`, `src/app/portfolio/page.tsx`, `src/components/PortfolioValue.tsx`, `src/lib/referral.ts`, `src/lib/referral-program.ts`, `src/components/InviteCard.tsx`, `src/components/ShareButton.tsx`, `src/lib/friends.ts`, `src/lib/leagues.ts`, `src/app/leaderboard/page.tsx`, `src/components/InstallApp.tsx`, `public/sw.js`, `src/app/manifest.ts` |
| מדידה | `src/lib/events.ts`, `src/lib/analytics.ts`, `src/lib/track.ts`, `src/components/Analytics.tsx`, `src/components/GoogleAnalytics.tsx`, `src/lib/gtag.ts`, `src/lib/ga-bridge.ts`, `src/lib/stats.ts`, `src/lib/bundle.ts`, `src/app/admin/**`, `src/app/api/health/route.ts` |
| ביצועים ותשתית | `src/app/(listing)/page.tsx`, `src/app/(listing)/loading.tsx`, `src/lib/markets.ts`, `next.config.ts`, `src/app/layout.tsx`, `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `.github/workflows/deploy.yml`, `src/lib/db/index.ts` |
| SEO | `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/lib/llms-txt.ts`, `src/app/market/[slug]/og/route.tsx`, `public/og.png`, `scripts/test-seo.ts` |
| משפטי | `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/app/about/page.tsx`, `src/lib/config.ts` |

## נספח ד׳ — שאלות לטיפול מיידי (נכון ל-6.9, לוודא מול השרת לפני פעולה)

- **עבר מועדן ופתוחות ב-`main`** (השרת כבר הכריע חלק): `another-party-quits-sat-night`, `smotrich-inside-likud-report-sat-night`, `haredi-parties-18-seats-poll-sat-night`, `yashar-ahead-of-likud-saturday-night-poll-sat-night`, `eisenkot-saturday-night-tv-interview-sat-night`; **באיחור בשרת:** `elections-committee-elector-ruling-sunday-1700`, `netanyahu-cabinet-remarks-draft-ruling-sunday`.
- **הכלה (אירוע אחד מכריע שתיים):** `golan-sues-sara-netanyahu-oct7` ⊃ `golan-files-defamation-suit-sara-netanyahu-monday`; `netanyahu-responds-hcj-draft-arrests-sunday` ⊃ `netanyahu-cabinet-remarks-draft-ruling-sunday`.
- **מעורפלות / קשות להכרעה:** `channel14-removes-sara-interview-sunday`, `netanyahu-responds-shabbat-interview-backlash-sunday`, `netanyahu-haredi-leaders-contact-sunday`, `smotrich-inside-likud-report-sat-night`, `another-party-quits-sat-night`.
- **מיועדת לביטול לפי הקריטריון שלה:** `eisenkot-first-mandate-to-form-government` (featured).
- **מחוץ ל-5–95%:** `sara-netanyahu-public-apology-golan` (4%), `state-commission-oct7-decision-before-election` (3%).
- **חלון קצר מתומחר >50% בלי אירוע מתוזמן:** `idf-lebanon-strike-announcement-sunday-eve` (85%), `yisrael-beitenu-full-list-published-sunday`, `israel-katz-above-saar-likud-list`, `yashar-full-candidate-list-published-by-sept8`.
- **כותרות >95 תווים (לא נכנסות להירו של הנחיתה), דוגמה:** `likud-reserved-slot-right-bloc-merger`, `right-list-below-threshold-final-ch12-poll`, `netanyahu-bloc-outscores-change-bloc-in-seats`, `hendel-tropper-join-eisenkot-monday`, `yoram-cohen-second-yashar-list`.

## נספח ה׳ — מילון קופי (מונח אחד לכל מושג)

| מושג | המונח | לא |
|---|---|---|
| ההסתברות שמוצגת | **הסיכוי ל״כן״** | מד הביטחון, מד הניחושים, מחיר, המד |
| מה מקבלים אם צדקו | **ניקוד אם צדקתם** / **≈X נק׳ אם צדקתם** | תשלום, זכייה, רווח (למחוברים בדף הניקוד: ״רווח/הפסד״ מותר) |
| יחידת הכסף | **נק׳** (נקודות משחק) | ₪, מטבעות |
| שינוי במד | **▲1.7%** / **מ-38% ל-40%** | +1.7 נק׳ |
| פוזיציה | **התשובה שלכם** | אחיזה, יחידות, מניות |
| מכירה | **לבטל תשובה** / **לנעול +X** | החזרה |
| פנייה | **רבים** (עניתם, צדקתם, התחברו) | יחיד, לוכסנים (ענה/תה) |
| הגילוי | **נקודות משחק בלבד · אין כסף אמיתי · אין פרסים ואין תשלום** — פעם אחת בדף | חזרה שלוש פעמים |
| מסגור המשחק | **משחק ידע** | משחק ניחושים, שוק חיזויים (מותר רק במדריך שמסביר את ההבדל) |
| מסלול ההרשמה | **חשבון חינם בלחיצה אחת עם Google** | הרשמה (כפעולה עם טופס) |

## נספח ו׳ — תבניות

### תדריך ל-Claude Code (`ops/briefs/YYYY-MM-DD-<מזהה>.md`)

```
# <מזהה> — <כותרת בעברית, משפט אחד>

## למה
<הראיה: מספר מהחבילה / צילום מסך / שורת קוד. משפט אחד על מה זה עולה לנו היום.>

## מה לבנות
<תיאור ההתנהגות הרצויה במונחי המשתמש, לא במונחי הקוד. מסך, קופי מדויק, מכניקה.>

## איפה
<קבצים ידועים. אם לא בטוח — "לחפש את הטקסט X".>

## מה לא לשנות
<גבולות: לא לגעת ב-settleMarket, לא לשנות GUEST_LIMIT, וכו׳.>

## קריטריוני קבלה
- [ ] <התנהגות שאפשר לבדוק>
- [ ] בדיקה חדשה/מורחבת ב-scripts/test-*.ts
- [ ] typecheck, lint, npm test, build — ירוקים
- [ ] צילומי לפני/אחרי ב-390×664 ו-320px (מסלול האורח מ-/welcome)
- [ ] אין ניסוח מרשימת 🛑 בסעיף 3 של ops/COWORK-OPTIMIZE.md

## המדד שאמור לזוז
<שם האירוע/מפתח בחבילה, ערך היום, ערך שנצפה לו, מתי בודקים.>
```

### רשומה ביומן (`ops/LOG.md`)

```
## YYYY-MM-DD · <מזהה> · <כותרת>
- מה שונה: <משפט> · PR #N · פרוס ב-HH:MM
- למה: <הראיה>
- מדד: <שם> · לפני: X (n=) · יעד: Y
- +24h: <ערך, n> · +7d: <ערך, n> · מסקנה: <עבד / לא עבד / עוד אין תשובה>
```

---

**נקודת התחלה מומלצת לסשן הראשון שלך:** קרא את `ops/LOG.md`, משוך `days=7`, בצע C1–C2, פתח את
התדריכים ל-A1, A2, A3, B1, G10, ובקש מהבעלים אישור אחד לרשימת D1. זה שבוע ראשון שלם, והוא
מניח את היסודות לכל השאר.
