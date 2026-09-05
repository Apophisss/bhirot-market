# בחירות מרקט — שוק החיזויים של בחירות 2026 🗳️

אתר בסגנון **Polymarket** על הבחירות לכנסת ה־26, **בכסף וירטואלי בלבד**: התחברות עם Google, מסחר במניות ״כן״/״לא״
עם עושה שוק אוטומטי (LMSR), גרפים, תיק אישי, לוח מובילים, תגובות — והכי חשוב: **השאלות מתעדכנות פעם בשעה על ידי צוות המערכת**
בהתאם לחדשות (סקרים, מהלכים פוליטיים, משפט נתניהו, חוק הגיוס, תביעות דיבה וכו׳).

דוגמאות לשאלות: *״האם יאיר גולן יגיש תביעת דיבה נגד שרה נתניהו עד 31.12.2026?״*,
*״האם ערוץ 14 יפרסם סקר שנותן לליכוד 30 מנדטים ומעלה עד 15.9?״*.

## מה יש כאן

| חלק | טכנולוגיה |
|---|---|
| אתר | Next.js 16 (App Router, RTL, עברית), React 19, Tailwind CSS 4 |
| התחברות | Auth.js v5 — Google OAuth (+ כניסת פיתוח מהירה ללא סיסמה) |
| מסד נתונים | libSQL / SQLite (קובץ מקומי בפיתוח, [Turso](https://turso.tech) בפרודקשן) דרך Drizzle ORM |
| מנוע שוק | LMSR בינארי (`src/lib/lmsr.ts`) — ₪10,000 וירטואליים לכל משתמש, תשלום ₪1 למניה מנצחת |
| תוכן | `data/markets.json` — מקור האמת לשאלות; מסונכרן למסד הנתונים אוטומטית |
| תמונות | תמונות אישי ציבור מוורדות מ־Wikimedia Commons אל `public/people/` (`npm run people:fetch`) — האתר לא מקשר החוצה — + עטיפות SVG לכל קטגוריה ותמונת שיתוף (`public/og.png`) |
| עדכון שעתי | (א) **רוטינת העדכון** של צוות המערכת, שעורכת את `data/markets.json` לפי `AGENT.md`; (ב) מחולל השאלות המובנה `/api/cron/refresh` (Vercel Cron) עם חיפוש באינטרנט |
| אנליטיקה | מעקב עצמי (first-party) בלי קוקיז ובלי צד שלישי — צפיות, זמן שהייה, גלילה, לחיצות, חיפושים, עסקאות, Core Web Vitals ושגיאות דפדפן |
| ניהול | `/admin` — לוח סטטיסטיקות (תנועה, משפך, שווקים, משתמשים) + הורדת **באנדל נתונים** לניתוח |

## הרצה מקומית

```bash
npm install
cp .env.example .env.local        # ערכו: AUTH_SECRET (openssl rand -base64 32), ADMIN_TOKEN
npm run dev                       # http://localhost:3000
```

- מסד הנתונים נוצר לבד ב־`data/local.db` (המיגרציות רצות אוטומטית בעלייה).
- בלי Google OAuth אפשר להיכנס עם ״כניסה מהירה לפיתוח״ (`ALLOW_DEV_LOGIN=true`). בבילד פרודקשן היא כבויה בקוד, גם אם המשתנה מוגדר.
- `data/markets.json` נטען למסד הנתונים בטעינה הראשונה ובכל `npm run markets:sync`.

### התחברות עם Google

1. ב־[Google Cloud Console](https://console.cloud.google.com/apis/credentials) צרו **OAuth client ID** מסוג Web application.
2. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` ובפרודקשן `https://<domain>/api/auth/callback/google`.
3. העתיקו ל־`.env.local`: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.

## פריסה ל־Vercel

1. צרו מסד Turso: `turso db create bhirot-market` → `turso db show --url` ו־`turso db tokens create`.
2. ב־Vercel הגדירו משתני סביבה: `DATABASE_URL` (libsql://…), `DATABASE_AUTH_TOKEN`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `ADMIN_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, ואופציונלית `ANTHROPIC_API_KEY` (+`CLAUDE_MODEL`),
   `ADMIN_EMAILS` (כניסה ל-`/admin` עם חשבון Google) ו-`ANALYTICS_SALT`.
3. `vercel.json` כבר מגדיר Cron שעתי ל־`/api/cron/refresh`, שמסנכרן את `data/markets.json` ומריץ את המחולל המובנה אם יש מפתח API.

## שאלות קצרות טווח

הלב של האתר הן שאלות שנסגרות **תוך 24–72 שעות** ("עד מוצאי שבת", "בישיבת הממשלה מחר", "במהדורה של הערב") —
אפשר לקנות, לראות הכרעה ולחזור. גם הרוטינה השעתית וגם המחולל המובנה מחויבים לתמהיל: **לפחות שליש**
מהשאלות בכל ריצה חייבות להיסגר בטווח הזה, והשאר 1–6 שבועות. דף הבית מציג אותן במדור "⏱️ נסגר היום או מחר",
והכרטיס מראה ספירה לאחור בשעות.

## איך העדכון השעתי עובד

### א. רוטינת העדכון של צוות המערכת (הדרך העיקרית)

הרוטינה רצה פעם בשעה, פותחת סשן חדש בריפו, וקוראת את [`AGENT.md`](AGENT.md) — נוהל העבודה של המערכת:

1. חוקרת את החדשות הפוליטיות של 24–72 השעות האחרונות (חיפוש באינטרנט).
2. מוסיפה 2–6 שאלות חדשות, חדות וניתנות להכרעה, עם מועד יעד, קריטריוני הכרעה ומקורות.
3. מכריעה שווקים שהאירוע שלהם קרה (עם ראיה ומקור) — הפוזיציות משולמות אוטומטית.
4. מריצה `npm run markets:validate`, מבצעת commit + push של `data/markets.json`.
5. אם מוגדרים `SITE_URL` ו־`ADMIN_TOKEN` בסביבת הרוטינה — דוחפת מיד ל־`POST /api/admin/markets`, אחרת השינוי עולה עם ה־deploy הבא.

### ב. המחולל המובנה (`src/lib/agent/generate.ts`)

`GET /api/cron/refresh` (עם `Authorization: Bearer <CRON_SECRET|ADMIN_TOKEN>`) מריץ שני שלבים:
מחקר עם כלי `web_search` → פלט מובנה (Zod) של שאלות חדשות והכרעות → ולידציה, סינון כפילויות, והכנסה למסד.
אפשר להריץ ידנית: `npm run markets:generate -- --dry-run`.

## אנליטיקה ועמוד הניהול

האתר מודד את עצמו, בלי Google Analytics ובלי שום צד שלישי: `src/components/Analytics.tsx` שולח אירועים ב-`sendBeacon`
אל `POST /api/analytics/collect`, והם נשמרים בטבלה `analytics_event` באותו מסד נתונים.

- **מה נמדד**: צפיות בעמודים (כולל `utm_*` ומקור הפניה), זמן שהייה ועומק גלילה, לחיצות על אלמנטים שמסומנים ב-`data-evt`,
  קישורים יוצאים, חיפושים, Core Web Vitals אמיתיים מהשדה ושגיאות דפדפן (`src/instrumentation-client.ts`).
  עסקאות, תגובות והרשמות נרשמות **בצד השרת**, כך שחוסם פרסומות לא יכול להסתיר אותן.
- **פרטיות**: אין קוקי מעקב. מבקר מזוהה ב-hash של IP+דפדפן שמתחלף כל יום (`ANALYTICS_SALT`), ה-IP עצמו לא נשמר,
  ואירועים נמחקים אוטומטית אחרי `ANALYTICS_RETENTION_DAYS` (ברירת מחדל 180 יום) בכל ריצת cron.
- **כיבוי**: `ANALYTICS_DISABLED=true`.

`/admin` (כניסה עם `ADMIN_TOKEN` דרך `/admin/login`, או חשבון Google שמופיע ב-`ADMIN_EMAILS`; בפיתוח בלי שניהם — פתוח):

| מסך | מה יש בו |
|---|---|
| `/admin` | מדדים ראשיים, "מה כדאי לתקן" (בעיות שנגזרות אוטומטית), גרפים יומיים, משפך, עמודים ומקורות, ריצות העדכון השעתי |
| `/admin/traffic` | עמודים, מקורות, קמפיינים, מכשירים, מדינות, שעות היום, אירועים, לחיצות, חיפושים, Web Vitals ושגיאות |
| `/admin/markets` | בריאות התוכן, כיול המחירים (ציון Brier), ביצועי קטגוריות, טבלת כל השווקים, מי מחכה להכרעה ומי בלי עסקאות |
| `/admin/users` | הרשמות ליום, קוהורטות שימור, פילוח מסחר ולוח מובילים |
| `/admin/bundle` | הורדת באנדל הנתונים + הפרומפט המומלץ להעברה לסוכן |

## באנדל הנתונים (לניתוח ושיפור האתר)

`GET /api/admin/bundle?days=90&format=json|md` מחזיר קובץ אחד עם כל מה שידוע על האתר: הבעיות שזוהו,
המשפך, תנועה יומית, מעורבות לכל שוק, קוהורטות, ביצועים, שגיאות, ריצות העדכון — ובנוסף `guide` עם מילון מונחים,
קטלוג האירועים ומפת הקוד, כדי שסוכן יוכל לנתח ולהציע שיפורים בלי הסברים נוספים. הקובץ **לא** מכיל שמות,
אימיילים, כתובות IP או מזהי משתמש.

```bash
SITE_URL=https://<domain> ADMIN_TOKEN=... npm run bundle -- --days 90
# → bhirot-market-2026-09-05.json  (העבירו לסוכן יחד עם הפרומפט מ-/admin/bundle)
```

## API

| נתיב | תיאור |
|---|---|
| `GET /api/markets?status=open&category=polls&q=…&sort=trending` | רשימת שווקים (ציבורי) |
| `GET /api/markets/:slug` | שוק + היסטוריית מחירים + עסקאות אחרונות |
| `POST /api/trade` `{marketId, side, action, quantity}` | קנייה/מכירה (דורש התחברות) |
| `POST /api/comments` | תגובה לשוק |
| `POST /api/admin/markets` `{markets:[…], note, source}` | Upsert/הכרעה של שווקים (Bearer `ADMIN_TOKEN`) |
| `GET /api/admin/markets` | ייצוא מלא של השווקים (Bearer `ADMIN_TOKEN`) |
| `POST /api/sync` | סנכרון `data/markets.json` → DB (Bearer `ADMIN_TOKEN`) |
| `GET /api/cron/refresh` | סנכרון + מחולל השאלות (Bearer `CRON_SECRET`/`ADMIN_TOKEN`) |
| `GET /api/health` | סטטיסטיקות ועדכון אוטומטי אחרון |
| `POST /api/analytics/collect` | קליטת אירועי מעקב מהדפדפן (ציבורי, ללא PII) |
| `GET /api/admin/bundle?days=90&format=json\|md` | באנדל הנתונים לניתוח (Bearer `ADMIN_TOKEN` או קוקי ניהול) |

## סקריפטים

```bash
npm run markets:validate   # סכמה + כל שוק חייב תמונה וכותרת שמסתיימת בסימן שאלה
npm run markets:sync       # סנכרון הקובץ למסד הנתונים (לפי DATABASE_URL)
npm run markets:merge f.json --note "..."   # איחוד אצווה של שאלות שנוצרו אוטומטית, עם דה-דופליקציה
npm run people:fetch       # הורדת תמונות חדשות מוויקיפדיה אל public/people (‎-- --force לרענון)
npm run markets:generate   # הרצת המחולל המובנה (דורש ANTHROPIC_API_KEY)
npm run db:generate        # יצירת מיגרציה אחרי שינוי בסכמה
npm run bundle             # הורדת באנדל הנתונים לקובץ (דורש SITE_URL + ADMIN_TOKEN)
```

## מבנה

```
data/markets.json        השאלות (מקור האמת, נערך ע"י צוות המערכת)
data/people.json         אנשים + נתיב לתמונה המקומית
public/people/           תמונות אישי ציבור (Wikimedia Commons, רישיונות חופשיים)
AGENT.md                 נוהל העבודה של רוטינת העדכון
src/lib/lmsr.ts          מתמטיקת עושה השוק
src/lib/trade.ts         ביצוע עסקאות והכרעות (טרנזקציות)
src/lib/sync.ts          סנכרון JSON → DB
src/lib/agent/           מחולל השאלות המובנה (מודל שפה + web search)
src/lib/analytics.ts     קליטת אירועים בצד השרת (hash מבקר, סינון בוטים, מחיקה לפי מדיניות)
src/lib/stats.ts         כל שאילתות הדוחות של לוח הניהול והבאנדל
src/lib/bundle.ts        בניית באנדל הנתונים (JSON + דוח Markdown)
src/components/Analytics.tsx  המעקב בצד הדפדפן (sendBeacon)
src/app/admin/           לוח הניהול: סקירה, תנועה, שווקים, משתמשים, באנדל
src/app/                 דפים: /, /market/[slug], /portfolio, /leaderboard, /activity, /about, /login, /admin
```

## גילוי נאות

פרויקט הדגמתי/קהילתי. כסף וירטואלי בלבד, ללא ערך כספי. לא קשור לאף מפלגה או גוף תקשורת. תמונות אישי ציבור
מ־Wikimedia Commons תחת רישיונות חופשיים.
