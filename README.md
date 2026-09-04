# בחירות מרקט — שוק החיזויים של בחירות 2026

אתר בסגנון **Polymarket** על הבחירות לכנסת ה־26, **בכסף וירטואלי בלבד**: התחברות עם Google, מסחר במניות ״כן״/״לא״
עם עושה שוק אוטומטי (LMSR), **מצב זריז** לענות על שאלה אחרי שאלה, גרפים, תיק אישי, לוח מובילים, תגובות —
והכי חשוב: **השאלות מתעדכנות פעם בשעה על ידי צוות המערכת** בהתאם לחדשות (סקרים, מהלכים פוליטיים, משפט נתניהו,
חוק הגיוס, תביעות דיבה וכו׳).

דוגמאות לשאלות: *״האם יאיר גולן יגיש תביעת דיבה נגד שרה נתניהו עד 31.12.2026?״*,
*״האם ערוץ 14 יפרסם סקר שנותן לליכוד 30 מנדטים ומעלה עד 15.9?״*.

## מה יש כאן

| חלק | טכנולוגיה |
|---|---|
| אתר | Next.js 16 (App Router, RTL, עברית), React 19, Tailwind CSS 4 |
| התחברות | Auth.js v5 — Google OAuth (+ כניסת פיתוח מהירה ללא סיסמה) |
| מסד נתונים | libSQL / SQLite (קובץ מקומי בפיתוח, [Turso](https://turso.tech) בפרודקשן) דרך Drizzle ORM |
| מנוע שוק | LMSR בינארי (`src/lib/lmsr.ts`) — ₪10,000 וירטואליים לכל משתמש, תשלום ₪1 למניה מנצחת |
| מצב זריז | פיד שאלות ב־`/rapid`: תשובת ״כן״/״לא״ = קנייה מחייבת בטווח ₪5–₪100 דרך אותו LMSR |
| תוכן | `data/markets.json` — מקור האמת לשאלות; מסונכרן למסד הנתונים אוטומטית |
| תמונות | תמונות אישי ציבור מוורדות מ־Wikimedia Commons אל `public/people/` (`npm run people:fetch`) — האתר לא מקשר החוצה — + עטיפות SVG לכל קטגוריה ותמונת שיתוף (`public/og.png`) |
| גרף המגמה | היסטוריה אמיתית מ־`price_history` + אומדן טרום־מסחר מקווקו לתצוגה בלבד (`src/lib/synthetic-history.ts`), חסום ל־±3 נק׳ מהמחיר הרשום |
| עדכון שעתי | (א) **רוטינת העדכון** של צוות המערכת, שעורכת את `data/markets.json` לפי `AGENT.md`; (ב) מחולל השאלות המובנה `/api/cron/refresh` (Vercel Cron) עם חיפוש באינטרנט |

## מצב זריז (`/rapid`)

פיד מסך־מלא שמקפיץ שאלה אחרי שאלה, לענות עליהן ברצף:

- בוחרים **פעם אחת** סכום לכל תשובה, **בטווח מחייב של ₪5–₪100** (סליידר + קיצורים). הבחירה נשמרת ב־`localStorage`.
- עונים ״כן״/״לא״ בלחיצה, בהחלקה של הכרטיס (ימינה = כן, שמאלה = לא), או במקלדת: `→` כן · `←` לא · `רווח` דילוג · `+`/`−` סכום.
- כל תשובה היא **עסקה מחייבת** — קניית מניות באותו עושה שוק של דף השוק, שיורדת מהיתרה מיד. אין ביטול; אפשר למכור בדף השוק.
- הכרטיס מתחלף מיד והעסקה נשלחת ברקע בתור **סדרתי** (בקשה אחת בכל רגע), כדי לא להתנגש על יתרת המשתמש.
- שאלות שכבר ענית עליהן לא חוזרות בפיד (אפשר להחזיר אותן עם `?all=1`), ובסוף הרצף מוצג סיכום: כמה נענו, כמה הושקע, וכמה ישולם אם צדקת בהכל.

הטווח נאכף פעמיים: בסליידר, ושוב ב־`POST /api/rapid/answer` — שם הוא תכונה של ה־endpoint, כך שהלקוח לא יכול לוותר עליו.
`MIN_TRADE`/`MAX_TRADE` של מנוע המסחר לא השתנו; הם עדיין משרתים את פאנל המסחר המלא.

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

## פריסה לשרת (bhirot-market.com)

האתר רץ על שרת משלנו: כל דחיפה ל־`main` בונה תמונת Docker ומעלה אותה לאתר. הכל ב־
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

1. **סוד אחד חובה** — `Settings → Secrets and variables → Actions`:
   `SSH_PASSWORD` (סיסמת ה־root של השרת). `SSH_HOST` ברירת מחדל `bhirot-market.com` ו־`SSH_USER` ברירת מחדל `root`;
   הגדירו אותם רק אם השרת נמצא במקום אחר.
2. **סודות אופציונליים**: `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` (בלעדיהם אין דרך להתחבר לאתר),
   `ANTHROPIC_API_KEY` (מפעיל את מחולל השאלות בכל שעה), וכן `AUTH_SECRET` / `ADMIN_TOKEN` / `CRON_SECRET`
   אם רוצים לקבוע אותם ידנית — אחרת השרת מגריל אותם בפריסה הראשונה ושומר אותם ב־`/opt/bhirot-market/.secrets/`,
   כדי שפריסה לא תנתק כל מי שמחובר.
3. **משתנים** (`vars`, ניתנים לקריאה בממשק): `DOMAIN` (ברירת מחדל `bhirot-market.com`), `CLAUDE_MODEL`,
   ו־`ALLOW_DEV_LOGIN` — כניסה מהירה ללא סיסמה, כבויה כברירת מחדל ולא כדאי להדליק באתר ציבורי.
4. **DNS**: רשומת `A` של הדומיין (ו־`www`) אל ה־IP של השרת — אחת, לא כמה: Let's Encrypt מגריל רשומה
   מבין כל מה שקיים, וכך גם הדפדפן של כל גולש. בזמן החלפת DNS יש חלון שבו resolverים עדיין מחזיקים גם
   את הרשומה הישנה וגם את החדשה; בגלל החלון הזה הפריסה בוחרת את הכתובת שבאמת עונה ב־ssh ולא מגרילה,
   ומדפיסה אזהרה כשהיא רואה יותר מרשומה אחת.

מה רץ על השרת (`/opt/bhirot-market`, ראו [`docker-compose.yml`](docker-compose.yml)):

| שירות | תפקיד |
|---|---|
| `app` | האתר עצמו (תמונה בנויה מראש מ־ghcr.io). המסד הוא קובץ SQLite ב־volume בשם `bhirot-data` — פריסה לא נוגעת בו |
| `caddy` | HTTPS, הפניית `www`, ו־reverse proxy אל האפליקציה |
| `cron` | השעון של [`/api/cron/refresh`](scripts/cron-refresh.sh) — מה ש־`vercel.json` נתן ב־Vercel |

הפריסה בונה את התמונה על ה־runner ולא על השרת (‏`next build` חונק את הזיכרון של מכונה קטנה), מסנכרנת את
קבצי ההרצה ב־rsync, כותבת `.env` דרך stdin (שום סוד לא מגיע לשורת פקודה), מרימה, ומחכה ל־`/api/health` —
אם האתר לא עולה תוך שלוש דקות הריצה נכשלת ומדפיסה את הלוג של הקונטיינר.

הרצה מקומית של אותה ערימה: `cp .env.example .env` (הוסיפו `APP_IMAGE=bhirot-market:local` ו־`DOMAIN=localhost`),
`docker build -t bhirot-market:local .`, `docker compose up -d`.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) מריץ typecheck, lint, בדיקות ו־build על כל PR — כדאי
להגדיר את `Checks / verify` כ־required status check על `main`, אחרת אפשר למזג ולפרוס בנייה שבורה.

## פריסה ל־Vercel (חלופה)

1. צרו מסד Turso: `turso db create bhirot-market` → `turso db show --url` ו־`turso db tokens create`.
2. ב־Vercel הגדירו משתני סביבה: `DATABASE_URL` (libsql://…), `DATABASE_AUTH_TOKEN`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
   `AUTH_GOOGLE_SECRET`, `ADMIN_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, ואופציונלית `ANTHROPIC_API_KEY` (+`CLAUDE_MODEL`).
3. `vercel.json` כבר מגדיר Cron שעתי ל־`/api/cron/refresh`, שמסנכרן את `data/markets.json` ומריץ את המחולל המובנה אם יש מפתח API.

## שאלות קצרות טווח

הלב של האתר הן שאלות שנסגרות **תוך 24–72 שעות** ("עד מוצאי שבת", "בישיבת הממשלה מחר", "במהדורה של הערב") —
אפשר לקנות, לראות הכרעה ולחזור. גם הרוטינה השעתית וגם המחולל המובנה מחויבים לתמהיל: **לפחות שליש**
מהשאלות בכל ריצה חייבות להיסגר בטווח הזה, והשאר 1–6 שבועות. דף הבית מציג אותן במדור "נסגר היום או מחר",
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
| `GET /api/markets/:slug` | שוק + היסטוריית מחירים אמיתית (`history`) + סדרת הגרף עם האומדן (`chartHistory`, `chartHistoryMeta`) + עסקאות אחרונות |
| `POST /api/trade` `{marketId, side, action, quantity}` | קנייה/מכירה (דורש התחברות) |
| `POST /api/rapid/answer` `{marketId, side, stake}` | תשובה במצב זריז — קנייה מחייבת של ₪5–₪100 בצד שנבחר (דורש התחברות) |
| `POST /api/comments` | תגובה לשוק |
| `POST /api/admin/markets` `{markets:[…], note, source}` | Upsert/הכרעה של שווקים (Bearer `ADMIN_TOKEN`) |
| `GET /api/admin/markets` | ייצוא מלא של השווקים (Bearer `ADMIN_TOKEN`) |
| `POST /api/sync` | סנכרון `data/markets.json` → DB (Bearer `ADMIN_TOKEN`) |
| `GET /api/cron/refresh` | סנכרון + מחולל השאלות (Bearer `CRON_SECRET`/`ADMIN_TOKEN`) |
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
npm run markets:validate   # סכמה + כל שוק חייב תמונה וכותרת שמסתיימת בסימן שאלה
npm run markets:audit      # ביקורת עריכה של הלוח: חוב הכרעות, תמהיל מועדים, אחוזים, כפילויות, מקורות, כיול
npm run markets:liquidity -- --p 0.3   # כמה גמיש השוק יהיה בכל ערך liquidity, ומה מומלץ
npm run markets:sync       # סנכרון הקובץ למסד הנתונים (לפי DATABASE_URL)
npm run markets:merge f.json --note "..."   # איחוד אצווה של שאלות שנוצרו אוטומטית, עם דה-דופליקציה
npm run people:fetch       # הורדת תמונות חדשות מוויקיפדיה אל public/people (‎-- --force לרענון)
npm run markets:generate   # הרצת המחולל המובנה (דורש ANTHROPIC_API_KEY)
npm run history:verify     # בדיקת החסמים של גרף האומדן (--sparklines להצגת העקומות)
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
src/lib/rapid.ts         קבועי ״מצב זריז״ (טווח הסכום המחייב) — ללא תלויות, נטען גם בדפדפן
src/lib/rapid-feed.ts    בניית פיד ״מצב זריז״ (שאילתה, ניקוד וסידור)
src/lib/elasticity.ts    תרגום liquidity לגמישות מחיר (כמה ₪100 מזיזים)
src/lib/synthetic-history.ts  אומדן הגרף לפני העסקה הראשונה (תצוגה בלבד, חסום)
src/lib/trade.ts         ביצוע עסקאות והכרעות (טרנזקציות)
src/lib/sync.ts          סנכרון JSON → DB
src/lib/agent/           מחולל השאלות המובנה (מודל שפה + web search)
src/lib/seo.ts           כותרות, canonical ו-JSON-LD (schema.org)
src/middleware.ts        הפניית 308 מ-/?category=x לדף הקטגוריה
src/app/                 דפים: /, /rapid, /category/[id], /market/[slug], /portfolio, /leaderboard, /activity, /about, /login
```

## SEO

- **כתובת האתר**: `NEXT_PUBLIC_SITE_URL` חייבת להיות הדומיין הפומבי המלא. כל ה-canonical, ה-sitemap וה-JSON-LD נגזרים ממנה.
- **דפי קטגוריה**: לכל קטגוריה יש דף אינדוקס משלה ב-`/category/<id>` עם `h1`, תיאור ייחודי (`description` ב-`src/lib/categories.ts`) ו-`CollectionPage` + `ItemList`. קישורים ישנים בסגנון `/?category=x` מקבלים 308 מ-`src/middleware.ts`.
- **מה נכנס לאינדקס**: דף הבית, `/?status=resolved`, דפי הקטגוריות, דפי השווקים ו-`/about`. תוצאות חיפוש, מיון ו"הצגת עוד" מסומנים `noindex, follow`; `/portfolio` ו-`/login` חסומים.
- **נתונים מובנים**: `Organization` + `WebSite` (עם SearchAction) בכל דף, `Article` + `BreadcrumbList` בדף שוק, `CollectionPage` בדפי רשימה ו-`FAQPage` ב-`/about` (השאלות נמצאות ב-`FAQ` ב-`src/lib/seo.ts` ומוצגות גם בדף עצמו — אין להוסיף שאלה ל-JSON-LD בלי להציג אותה).
- **קודי סטטוס**: שלד הטעינה (`loading.tsx`) חי רק תחת קבוצת הראוט `(listing)`. אם מוסיפים `loading.tsx` מעל דפי שוק/קטגוריה, ה-404 שלהם יהפוך ל-200 רך (soft 404).
- **אימות Search Console**: הגדירו `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` והתג ייווצר לבד.

## גילוי נאות

פרויקט הדגמתי/קהילתי. כסף וירטואלי בלבד, ללא ערך כספי. לא קשור לאף מפלגה או גוף תקשורת. תמונות אישי ציבור
מ־Wikimedia Commons תחת רישיונות חופשיים.
