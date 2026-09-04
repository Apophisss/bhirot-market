# בחירות מרקט — שוק החיזויים של בחירות 2026 🗳️

אתר בסגנון **Polymarket** על הבחירות לכנסת ה־26, **בכסף וירטואלי בלבד**: התחברות עם Google, מסחר במניות ״כן״/״לא״
עם עושה שוק אוטומטי (LMSR), גרפים, תיק אישי, לוח מובילים, תגובות — והכי חשוב: **השאלות מתעדכנות פעם בשעה על ידי Claude**
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
| תמונות | תמונות אישי ציבור מ־Wikimedia Commons (`data/people.json`, `npm run people:fetch`) + עטיפות SVG לפי קטגוריה |
| גרף המגמה | היסטוריה אמיתית מ־`price_history` + אומדן טרום־מסחר מקווקו לתצוגה בלבד (`src/lib/synthetic-history.ts`), חסום ל־±3 נק׳ מהמחיר הרשום |
| עדכון אוטומטי | (א) **Claude Code Routine** שעתית שעורכת את `data/markets.json` לפי `AGENT.md`; (ב) מחולל מובנה `/api/cron/refresh` (Vercel Cron) שמפעיל את Claude API עם חיפוש באינטרנט |

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

## איך העדכון השעתי עובד

### א. Claude Code Routine (הדרך העיקרית)

רוטינה ב־Claude Code רצה פעם בשעה, פותחת סשן חדש בריפו, וקוראת את [`AGENT.md`](AGENT.md):

1. חוקרת את החדשות הפוליטיות של 24–72 השעות האחרונות (חיפוש באינטרנט).
2. מוסיפה 2–6 שאלות חדשות, חדות וניתנות להכרעה, עם מועד יעד, קריטריוני הכרעה ומקורות.
3. מכריעה שווקים שהאירוע שלהם קרה (עם ראיה ומקור) — הפוזיציות משולמות אוטומטית.
4. מריצה `npm run markets:validate`, מבצעת commit + push של `data/markets.json`.
5. אם מוגדרים `SITE_URL` ו־`ADMIN_TOKEN` בסביבת הרוטינה — דוחפת מיד ל־`POST /api/admin/markets`, אחרת השינוי עולה עם ה־deploy הבא.

### ב. המחולל המובנה (`src/lib/agent/generate.ts`)

`GET /api/cron/refresh` (עם `Authorization: Bearer <CRON_SECRET|ADMIN_TOKEN>`) מריץ שני שלבים עם Claude API:
מחקר עם כלי `web_search` → פלט מובנה (Zod) של שאלות חדשות והכרעות → ולידציה, סינון כפילויות, והכנסה למסד.
אפשר להריץ ידנית: `npm run markets:generate -- --dry-run`.

## API

| נתיב | תיאור |
|---|---|
| `GET /api/markets?status=open&category=polls&q=…&sort=trending` | רשימת שווקים (ציבורי) |
| `GET /api/markets/:slug` | שוק + היסטוריית מחירים אמיתית (`history`) + סדרת הגרף עם האומדן (`chartHistory`, `chartHistoryMeta`) + עסקאות אחרונות |
| `POST /api/trade` `{marketId, side, action, quantity}` | קנייה/מכירה (דורש התחברות) |
| `POST /api/comments` | תגובה לשוק |
| `POST /api/admin/markets` `{markets:[…], note, source}` | Upsert/הכרעה של שווקים (Bearer `ADMIN_TOKEN`) |
| `GET /api/admin/markets` | ייצוא מלא של השווקים (Bearer `ADMIN_TOKEN`) |
| `POST /api/sync` | סנכרון `data/markets.json` → DB (Bearer `ADMIN_TOKEN`) |
| `GET /api/cron/refresh` | סנכרון + מחולל Claude (Bearer `CRON_SECRET`/`ADMIN_TOKEN`) |
| `GET /api/health` | סטטיסטיקות ועדכון אוטומטי אחרון |

## גרף המגמה: אומדן חסום לפני העסקה הראשונה

שוק חדש נפתח עם נקודת מחיר אחת, ולכן הגרף שלו שטוח עד לעסקה הראשונה. `src/lib/synthetic-history.ts` מצייר
לפני מועד הפתיחה **קו מקווקו של אומדן** — כדי שיהיה מה לראות, בלי לשנות את החיזוי:

- **חסם קשיח.** האומדן לעולם לא מתרחק מהמחיר הרשום ביותר מ־`SYNTHETIC_HISTORY_MAX_DEV` (ברירת מחדל 3 נק׳,
  תקרה קשיחה 5 נק׳ שאי אפשר לעקוף דרך משתני סביבה), ולא יותר מ־35% מהמרחק ל־0/1 — כלומר 1.05 נק׳ בלבד בשוק של 3%.
  ה״מחיר הרשום״ הוא קריאת LOCF של `price_history`, וזה מדויק: מחיר LMSR זז רק כשעסקה מזיזה אותו.
- **הנקודה האחרונה היא האמת עצמה.** הסדרה מסתיימת ב־`market.probability` בהשוואת `===`, וכל שורת `price_history`
  אמיתית מועברת כמות שהיא — בלי רעש, בלי clamp ובלי סימון.
- **תצוגה בלבד.** המודול חסין: אין בו שום `import`, שום שעון ושום אקראיות, ו־`eslint.config.mjs` אוסר עליו לייבא
  את מסד הנתונים ואוסר על `trade`/`sync`/`portfolio`/`lmsr`/המחולל לייבא אותו. שום נקודה משוערת לא נכתבת ל־DB.
- **דטרמיניסטי ובלתי משתנה.** הרעש ממופתח לפי זמן אבסולוטי, ולכן העבר לא ״נכתב מחדש״ בין רענונים.
- **נסוג מאליו.** מ־8 עסקאות אמיתיות ומעלה, ובשוק שהוכרע/בוטל/נסגר, האומדן נעלם לגמרי.
- **מסומן בגלוי.** קו מקווקו, רקע מקווקו, תווית ״אומדן״ וקו ״פתיחת המסחר״ בתוך הגרף; ריחוף מציג `≈` ותאריך ברמת יום;
  שינוי האחוזים בכותרת מחושב מנתונים אמיתיים בלבד. ב־API הציבורי `history` נשאר אמיתי, והאומדן נשלח בנפרד
  כ־`chartHistory` + `chartHistoryMeta`.

`npm run history:verify` בודק את כל זה (חסם, אנכור עצמאי, דטרמיניזם, אי־שינוי העבר, טוהר, שערים) על 28 השווקים
האמיתיים ועל עשרות אלפי מקרים אקראיים. הגדרות: ראו `.env.example`.

## סקריפטים

```bash
npm run markets:validate   # בדיקת סכמה של data/markets.json ו-data/people.json
npm run markets:sync       # סנכרון הקובץ למסד הנתונים (לפי DATABASE_URL)
npm run people:fetch       # השלמת תמונות מוויקיפדיה לאנשים חדשים
npm run markets:generate   # הרצת המחולל המובנה (דורש ANTHROPIC_API_KEY)
npm run history:verify     # בדיקת החסמים של גרף האומדן (--sparklines להצגת העקומות)
npm run db:generate        # יצירת מיגרציה אחרי שינוי בסכמה
```

## מבנה

```
data/markets.json        השאלות (מקור האמת, נערך ע"י Claude)
data/people.json         אנשים + תמונות
AGENT.md                 הנחיות לרוטינה של Claude
src/lib/lmsr.ts          מתמטיקת עושה השוק
src/lib/synthetic-history.ts  אומדן הגרף לפני העסקה הראשונה (תצוגה בלבד, חסום)
src/lib/trade.ts         ביצוע עסקאות והכרעות (טרנזקציות)
src/lib/sync.ts          סנכרון JSON → DB
src/lib/agent/           המחולל המובנה (Claude API + web search)
src/app/                 דפים: /, /market/[slug], /portfolio, /leaderboard, /activity, /about, /login
```

## גילוי נאות

פרויקט הדגמתי/קהילתי. כסף וירטואלי בלבד, ללא ערך כספי. לא קשור לאף מפלגה או גוף תקשורת. תמונות אישי ציבור
מ־Wikimedia Commons תחת רישיונות חופשיים.
