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

## הרצה מקומית

```bash
npm install
cp .env.example .env.local        # ערכו: AUTH_SECRET (openssl rand -base64 32), ADMIN_TOKEN
npm run dev                       # http://localhost:3000
```

- מסד הנתונים נוצר לבד ב־`data/local.db` (המיגרציות רצות אוטומטית בעלייה).
- בלי Google OAuth אפשר להיכנס עם ״כניסה מהירה לפיתוח״ (`ALLOW_DEV_LOGIN=true`, לא פעיל בפרודקשן).
- `data/markets.json` נטען למסד הנתונים בטעינה הראשונה ובכל `npm run markets:sync`.

### התחברות עם Google

1. ב־[Google Cloud Console](https://console.cloud.google.com/apis/credentials) צרו **OAuth client ID** מסוג Web application.
2. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` ובפרודקשן `https://<domain>/api/auth/callback/google`.
3. העתיקו ל־`.env.local`: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.

## פריסה ל־Vercel

1. צרו מסד Turso: `turso db create bhirot-market` → `turso db show --url` ו־`turso db tokens create`.
2. ב־Vercel הגדירו משתני סביבה: `DATABASE_URL` (libsql://…), `DATABASE_AUTH_TOKEN`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `ADMIN_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, ואופציונלית `ANTHROPIC_API_KEY` (+`CLAUDE_MODEL`).
3. `vercel.json` כבר מגדיר Cron שעתי ל־`/api/cron/refresh`, שמסנכרן את `data/markets.json` ומריץ את המחולל המובנה אם יש מפתח API.

## שאלות קצרות טווח

הלב של האתר הן שאלות שנסגרות **תוך 24–72 שעות** ("עד מוצאי שבת", "בישיבת הממשלה מחר", "במהדורה של הערב") —
אפשר לקנות, לראות הכרעה ולחזור. גם הרוטינה השעתית וגם המחולל המובנה מחויבים לתמהיל: **לפחות שליש**
מהשאלות בכל ריצה חייבות להיסגר בטווח הזה, והשאר 1–6 שבועות. דף הבית מציג אותן במדור "⏱️ נסגר היום או מחר",
והכרטיס מראה ספירה לאחור בשעות.

## איך העדכון השעתי עובד

### א. רוטינת העדכון של צוות המערכת (הדרך העיקרית)

הרוטינה רצה פעם בשעה, פותחת סשן חדש בריפו, וקוראת את [`AGENT.md`](AGENT.md) — נוהל העבודה של המערכת —
ואת הסקיל [`.claude/skills/market-questions`](.claude/skills/market-questions/SKILL.md), שמכיל את שיטת ההחלטה:
איך מחפשים שאלה, שבעת שערי הווידוא, בסיסי השכיחות לקביעת האחוזים, ובחירת גמישות השוק:

1. חוקרת את החדשות הפוליטיות של 24–72 השעות האחרונות (חיפוש באינטרנט).
2. מוסיפה 2–6 שאלות חדשות, חדות וניתנות להכרעה, עם מועד יעד, קריטריוני הכרעה ומקורות.
3. מכריעה שווקים שהאירוע שלהם קרה (עם ראיה ומקור) — הפוזיציות משולמות אוטומטית.
4. מריצה `npm run markets:validate` (סכמה) ו־`npm run markets:audit` (בריאות הלוח: חוב הכרעות, תמהיל מועדים, משמעת אחוזים, כיול), ומבצעת commit + push של `data/markets.json`.
5. אם מוגדרים `SITE_URL` ו־`ADMIN_TOKEN` בסביבת הרוטינה — דוחפת מיד ל־`POST /api/admin/markets`, אחרת השינוי עולה עם ה־deploy הבא.

### ב. המחולל המובנה (`src/lib/agent/generate.ts`)

`GET /api/cron/refresh` (עם `Authorization: Bearer <CRON_SECRET|ADMIN_TOKEN>`) מריץ שני שלבים:
מחקר עם כלי `web_search` → פלט מובנה (Zod) של שאלות חדשות והכרעות → ולידציה, סינון כפילויות, והכנסה למסד.
אפשר להריץ ידנית: `npm run markets:generate -- --dry-run`.

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

## סקריפטים

```bash
npm run markets:validate   # סכמה + כל שוק חייב תמונה וכותרת שמסתיימת בסימן שאלה
npm run markets:audit      # ביקורת עריכה של הלוח: חוב הכרעות, תמהיל מועדים, אחוזים, כפילויות, מקורות, כיול
npm run markets:liquidity -- --p 0.3   # כמה גמיש השוק יהיה בכל ערך liquidity, ומה מומלץ
npm run markets:sync       # סנכרון הקובץ למסד הנתונים (לפי DATABASE_URL)
npm run markets:merge f.json --note "..."   # איחוד אצווה של שאלות שנוצרו אוטומטית, עם דה-דופליקציה
npm run people:fetch       # הורדת תמונות חדשות מוויקיפדיה אל public/people (‎-- --force לרענון)
npm run markets:generate   # הרצת המחולל המובנה (דורש ANTHROPIC_API_KEY)
npm run db:generate        # יצירת מיגרציה אחרי שינוי בסכמה
```

## מבנה

```
data/markets.json        השאלות (מקור האמת, נערך ע"י צוות המערכת)
data/people.json         אנשים + נתיב לתמונה המקומית
public/people/           תמונות אישי ציבור (Wikimedia Commons, רישיונות חופשיים)
AGENT.md                 נוהל העבודה של רוטינת העדכון
.claude/skills/          שיטת העבודה: חיפוש, ווידוא, תמחור ובחירת גמישות של שאלות
src/lib/lmsr.ts          מתמטיקת עושה השוק
src/lib/elasticity.ts    תרגום liquidity לגמישות מחיר (כמה ₪100 מזיזים)
src/lib/trade.ts         ביצוע עסקאות והכרעות (טרנזקציות)
src/lib/sync.ts          סנכרון JSON → DB
src/lib/agent/           מחולל השאלות המובנה (מודל שפה + web search)
src/app/                 דפים: /, /market/[slug], /portfolio, /leaderboard, /activity, /about, /login
```

## גילוי נאות

פרויקט הדגמתי/קהילתי. כסף וירטואלי בלבד, ללא ערך כספי. לא קשור לאף מפלגה או גוף תקשורת. תמונות אישי ציבור
מ־Wikimedia Commons תחת רישיונות חופשיים.
