---
name: market-resolutions
description: >-
  Verifying and publishing the result of a bet on the בחירות מרקט board — find the markets whose
  deadline passed, research each one until a public page decides it, produce the approval report,
  record the human's approval, write it into data/markets.json and publish it to the live server.
  Use for "להכריע שווקים", "לאמת תוצאות", "מה התוצאה של השאלה", "דוח הכרעות", "חוב הכרעות",
  "resolution debt", "לפרסם את ההכרעות לשרת", or any run of `npm run resolve`.
---

# אימות תוצאות והכרעת שווקים

הכרעה מזיזה כסף (וירטואלי) בין משתמשים ואי אפשר לבטל אותה מהאתר. לכן היא לא נכתבת ישירות
ל-`data/markets.json`, אלא עוברת **ריצה** — קובץ ב-`data/resolutions/` שנושא, לכל שוק: מה השאלה
שאלה, מה מצאתם, איזה עמוד פומבי מוכיח את זה, מי אישר ומתי, ומה השרת ענה.

```
propose → מחקר → report → אישור אנושי → apply → publish
```

הכללים יושבים ב-`src/lib/resolution.ts` ונאכפים בקוד, לא בזיכרון: `apply` לא כותב כלום בלי אישור
חתום של בדיוק ההכרעה והראיה שהוצגו, ו-`publish` לא שולח כלום ש-`apply` לא כתב קודם.
`npm run test:resolution` מקבע את זה.

הצינור רץ **מתוזמן**: Routine בסביבת Claude Code פותחת סשן חדש חמש פעמים ביום בשעות היום בישראל,
מריצה `propose`, חוקרת, ומגישה דוח — ואז עוצרת. הפרוטוקול של ריצה מתוזמנת, על מה שהיא אסורה
לעשות, נמצא ב-[`.claude/routines/resolve.md`](../../routines/resolve.md). אותן פקודות עובדות גם
ידנית בכל סשן.

## 1. propose — מה בכלל מחכה

```bash
npm run resolve -- propose                 # כל השווקים שעבר מועדם
npm run resolve -- propose --grace 2       # בלי מה שנסגר בשעתיים האחרונות (הדיווח עוד לא יצא)
npm run resolve -- propose --from-server   # + מחיר, מחזור ומספר עסקאות מהאתר החי
```

נוצר `data/resolutions/<runId>.json` עם רשומה ריקה לכל שוק. `--from-server` דורש `SITE_URL`
ו-`ADMIN_TOKEN`, והוא שווה את זה: הדוח מראה כמה כסף באמת עומד על השאלה.

אם שוק כבר מופיע בריצה קודמת שלא פורסמה, propose מתריע. בדקו מה קרה שם לפני שממשיכים.

## 2. מחקר — הכלל היחיד שחשוב

**מכריעים רק על סמך עמוד פומבי שאפשר לפתוח שוב מחר.** זו החזרה היבשה ששער 3 של
`market-questions` הבטיח: מריצים את החיפוש שהשאלה הבטיחה, פותחים ב-WebFetch את התוצאה,
ומעתיקים ממנה ציטוט. לא זיכרון, לא "ידוע ש", לא URL שנבנה מהראש.

מלאו בכל רשומה:

| שדה | מה נכנס |
|---|---|
| `verdict` | `YES` / `NO` / `CANCELLED` |
| `confidence` | 0–1, כנה. מתחת ל-0.75 הדוח מסמן לאדם לקרוא לעומק |
| `note` | הנימוק בעברית שיוצג באתר: מה קרה, מתי, לפי מי. זה `resolutionNote` |
| `evidence` | `{title, url, quote, checkedAt}` — הציטוט מועתק מהעמוד, לא מנוסח מחדש |
| `searchedFor` | השאילתות שהרצתם בפועל |
| `researchedAt` | מתי |

מה חוסם (`checkEntry`), ולמה:

- **YES בלי ראיה** — אסור. אירוע שקרה משאיר עמוד.
- **YES שנשען רק על ציוץ/ויקיפדיה** — אסור. צריך דיווח או פרסום רשמי.
- **NO בלי ראיה** — מותר רק אם רשמתם **לפחות שתי שאילתות** ב-`searchedFor` שחזרו ריקות. "לא קרה"
  הוא טענה על היעדר, והתיעוד של החיפוש הוא מה שעומד במקום הראיה. הדוח יסמן את זה לאדם.
- **CANCELLED** — מחזיר את כל הכסף, ולכן דורש הסבר מלא למה השאלה אינה ניתנת להכרעה (כפילות,
  הנחה שגויה, מקור מכריע שלא קיים). כפילות: כתבו במפורש מול איזה slug.
- **הכרעה לפני מועד הסגירה** — רק עם `early.reason`.

אם שוק לא נסגר בראיה — אל תמציאו אחת. השאירו אותו בלי `verdict`, רשמו בריצה מה חסר, וחזרו אליו.
אם גם בריצה הבאה אין ראיה פומבית — זה `CANCELLED`, וזו שאלה שהייתה צריכה להיפסל בשער 3.

## 3. report — מה מראים לאדם

```bash
npm run resolve -- report                  # טרמינל + data/resolutions/<runId>.report.html
```

הדוח מציג לכל שאלה: הכותרת, קריטריון ההכרעה, ההכרעה המוצעת, הנימוק שיפורסם, הראיות עם הציטוטים,
והבעיות (`✗` חוסם · `⚠` לבדיקה). **שלחו את הקובץ למשתמש** ותנו לו להחליט. אל תסכמו במקומו
״הכל תקין״ — הדוח קיים כדי שהוא יראה את הראיה עצמה.

## 4. אישור — לא אתם

```bash
npm run resolve -- approve --by "שם המאשר" --all
npm run resolve -- approve --by "שם" --only slug-a,slug-b --reject slug-c --reason "הראיה חלשה"
```

`--by` חובה: אישור הוא של אדם ובשמו. מה שנרשם הוא טביעת אצבע של ההכרעה, הנימוק והראיות
כפי שהוצגו — **עריכה של אחד מהם אחרי האישור מבטלת אותו** וצריך לאשר מחדש. אל תאשרו בשם המשתמש,
ואל תפרשו "כן, תמשיך" בשיחה על משהו אחר כאישור להכרעות.

## 5. apply — כתיבה לקובץ

```bash
npm run resolve -- apply
npm run markets:validate && npm run markets:audit
```

`apply` כותב `status`, `resolution`, `resolutionNote` (עם ה-URL של הראיה) ו-`resolvedAt` בלבד.
`initialProbability`, `liquidity`, `slug`, `closesAt` והניסוח לא נגעו — משנים אותם רק אם התגלתה
טעות, ואף פעם לא כחלק מהכרעה. אם השאלה עצמה השתנתה מאז ה-propose, apply מסרב: האדם אישר שאלה
אחרת.

ואז commit:

```bash
git add data/markets.json data/resolutions
git commit -m "markets: הוכרעו N שווקים"
```

## 6. publish — לדבר עם השרת

```bash
npm run resolve -- publish --dry-run       # מה בדיוק יישלח
npm run resolve -- publish                 # POST /api/admin/markets + אימות
```

דורש `SITE_URL` ו-`ADMIN_TOKEN`. הפרסום שולח רק מה שאושר ונכתב, מנסה שוב על תקלת רשת,
ואז **קורא מהשרת** ומוודא שכל שוק באמת יצא ממצב `open`. אם לא — יציאה בשגיאה, וההכרעות מסומנות
`failed`. `publish` ניתן להרצה חוזרת: מה שכבר פורסם לא נשלח שוב.

## 7. סיכום למשתמש

בסוף כל ריצה אמרו במשפט: כמה הוכרעו ואיך, מה נדחה, מה נשאר בלי ראיה — ומה השרת אישר.
`npm run resolve -- status` נותן בדיוק את זה בכל רגע.

## מה הצינור הזה לא מכסה

המחולל המובנה של האתר (`src/lib/agent/generate.ts`, רץ מ-`/api/cron/refresh` כשמוגדר
`ANTHROPIC_API_KEY`) מכריע שווקים בעצמו, בלי לעבור בשערים האלה. אם משתמש שואל למה שוק הוכרע
בלי שאישר — זו התשובה. אל תתארו את השערים כאילו הם חלים על כל האתר.

## קבצים

- `src/lib/resolution.ts` — הסכמה והשערים (טהור, בלי מסד/רשת/שעון)
- `scripts/resolve.ts` — ה-CLI
- `scripts/test-resolution.ts` — `npm run test:resolution`
- `.claude/routines/resolve.md` — מה ריצה מתוזמנת עושה, ומתי היא רצה
- `data/resolutions/` — הארכיון של הריצות
- `.claude/skills/market-questions` — הצד השני: כתיבת שאלות ותמחורן
