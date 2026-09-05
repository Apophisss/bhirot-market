/**
 * בדיקות להגדרות המשתמש — מה שהופך את האתר לאותו אתר בכל מכשיר.
 *
 * הנקודה שכל הבדיקות כאן שומרות עליה היא אחת: מה שהמשתמש בחר נשמר בחשבון ולא
 * בדפדפן, ולכן הוא חוזר גם בכניסה הבאה, גם ממכשיר שני. שתי הבדיקות שיקרות ביותר
 * אם יישברו — `claimSettings` (אורח שהתחבר לא דורס בחירה של החשבון) ו"שורת הגדרות
 * לא מבטלת את השאלון", שהיא הסיבה שהטבלה נפרדת מ-`user_preference`.
 *
 * רץ מול קובץ SQLite זמני עם המיגרציות האמיתיות, כמו שאר בדיקות המסד.
 *
 * Run: npx tsx scripts/test-settings.ts   (also part of `npm test`)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// the db module reads DATABASE_URL lazily, on the first getDb() — setting it
// here (before main runs) is enough to keep the tests off the real database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bhirot-settings-"));
process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
delete process.env.DATABASE_AUTH_TOKEN;

import { getDb, schema } from "../src/lib/db";
import { claimSettings, getSettings, saveSettings } from "../src/lib/settings-store";
import { DEFAULT_SETTINGS, sanitizeSettings, surveySnoozed } from "../src/lib/settings";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE } from "../src/lib/rapid";
import { needsSurvey, savePreferences } from "../src/lib/preferences-store";

const { users } = schema;

let db: Awaited<ReturnType<typeof getDb>>;

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message.split("\n").join("\n    ")}`);
    console.error(`FAIL  ${name}`);
    console.error(`      ${(err as Error).message.split("\n")[0]}`);
  }
}

let seq = 0;
async function makeUser() {
  const id = `u${++seq}`;
  await db.insert(users).values({ id, name: `סוחר ${id}`, email: `${id}@test.local` });
  return id;
}

async function main() {
  db = await getDb();

  /* ------------------------------------------------------------ ניפוי קלט -- */

  await test("sanitizeSettings: משאיר רק מפתחות מוכרים", () => {
    const patch = sanitizeSettings({ rapidStake: 25, balance: 999999, isAdmin: true });
    assert.deepEqual(patch, { rapidStake: 25 });
  });

  await test("sanitizeSettings: הסכום נחתך לטווח המחייב", () => {
    assert.equal(sanitizeSettings({ rapidStake: 10_000 }).rapidStake, RAPID_MAX_STAKE);
    assert.equal(sanitizeSettings({ rapidStake: 1 }).rapidStake, RAPID_MIN_STAKE);
    assert.equal(sanitizeSettings({ rapidStake: "לא מספר" }).rapidStake, undefined);
  });

  await test("sanitizeSettings: מיון שאינו קיים נשמט ולא מתחלף בברירת מחדל", () => {
    assert.equal(sanitizeSettings({ rapidSort: "hot" }).rapidSort, "hot");
    // חשוב שיישמט ולא ייהפך ל-"mix": פה ההבדל בין "לא נגעתי במיון" ל"אפס לו את המיון"
    assert.equal(sanitizeSettings({ rapidSort: "מיון מומצא" }).rapidSort, undefined);
  });

  /* ---------------------------------------------------------- קריאה וכתיבה -- */

  await test("מי שלא בחר כלום מקבל את ברירות המחדל", async () => {
    const id = await makeUser();
    assert.deepEqual(await getSettings(id), DEFAULT_SETTINGS);
  });

  await test("אורח (בלי חשבון) מקבל ברירות מחדל ולא נופל", async () => {
    assert.deepEqual(await getSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(await getSettings(undefined), DEFAULT_SETTINGS);
  });

  await test("שינוי חלקי לא דורס את מה שלא נשלח", async () => {
    const id = await makeUser();
    await saveSettings(id, { rapidStake: 50 });
    await saveSettings(id, { rapidSort: "closing" });
    const s = await getSettings(id);
    assert.equal(s.rapidStake, 50, "הסכום שנבחר קודם שרד שמירה של המיון");
    assert.equal(s.rapidSort, "closing");
    assert.equal(s.rapidIncludeAnswered, false);
  });

  await test("הבחירה חוזרת בקריאה הבאה — זה כל העניין של מכשיר שני", async () => {
    const id = await makeUser();
    await saveSettings(id, { rapidStake: 35, rapidSort: "new", rapidIncludeAnswered: true });
    // קריאה חדשה לגמרי, בדיוק כמו רינדור של `/rapid` בדפדפן אחר
    const s = await getSettings(id);
    assert.equal(s.rapidStake, 35);
    assert.equal(s.rapidSort, "new");
    assert.equal(s.rapidIncludeAnswered, true);
  });

  await test("הסכום נחתך גם בדרך למסד", async () => {
    const id = await makeUser();
    await saveSettings(id, { rapidStake: 5_000 });
    assert.equal((await getSettings(id)).rapidStake, RAPID_MAX_STAKE);
  });

  await test("שמירה ריקה לא מפילה ולא משנה כלום", async () => {
    const id = await makeUser();
    await saveSettings(id, { rapidStake: 40 });
    await saveSettings(id, {});
    await saveSettings(id, null);
    assert.equal((await getSettings(id)).rapidStake, 40);
  });

  /* ------------------------------------------------- אימוץ בחירות של אורח -- */

  await test("אורח שהתחבר: מה שבחר נכנס לחשבון חדש", async () => {
    const id = await makeUser();
    await claimSettings(id, { rapidStake: 50 });
    assert.equal((await getSettings(id)).rapidStake, 50);
  });

  await test("אורח שהתחבר: מה שבחר לא דורס בחירה קיימת של החשבון", async () => {
    const id = await makeUser();
    await saveSettings(id, { rapidStake: 25 }); // נבחר קודם, אולי במכשיר אחר
    await claimSettings(id, { rapidStake: 50 });
    assert.equal((await getSettings(id)).rapidStake, 25, "החשבון מנצח את הדפדפן");
  });

  await test("אימוץ ממלא רק את מה שחסר", async () => {
    const id = await makeUser();
    await saveSettings(id, { rapidSort: "hot" });
    await claimSettings(id, { rapidStake: 45, rapidSort: "new" });
    const s = await getSettings(id);
    assert.equal(s.rapidStake, 45, "סכום שלא נבחר מעולם — מתאמץ");
    assert.equal(s.rapidSort, "hot", "מיון שכבר נבחר — לא נגעו בו");
  });

  /* ------------------------------------------------------ הדחייה של השאלון -- */

  await test('"לא עכשיו" נשמר בחשבון ופג מעצמו', async () => {
    const id = await makeUser();
    const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await saveSettings(id, { surveySnoozedUntil: until });
    const s = await getSettings(id);
    assert.equal(s.surveySnoozedUntil, until);
    assert.equal(surveySnoozed(s), true);
    assert.equal(surveySnoozed(s, until + 1), false, "אחרי שבוע ההצעה חוזרת");
  });

  await test("אפשר לבטל את ההשתקה", async () => {
    const id = await makeUser();
    await saveSettings(id, { surveySnoozedUntil: Date.now() + 1000 });
    await saveSettings(id, { surveySnoozedUntil: 0 });
    const s = await getSettings(id);
    assert.equal(s.surveySnoozedUntil, 0);
    assert.equal(surveySnoozed(s), false);
  });

  /* ------------------------------------ הסיבה שהטבלה נפרדת מ-user_preference -- */

  await test("שורת הגדרות לא נחשבת תשובה לשאלון", async () => {
    const id = await makeUser();
    assert.equal(await needsSurvey(id), true);
    await saveSettings(id, { rapidStake: 30 });
    assert.equal(await needsSurvey(id), true, "הזזת הסליידר אינה מילוי השאלון");
  });

  await test("תשובה לשאלון לא נמחקת בשמירת הגדרות", async () => {
    const id = await makeUser();
    await savePreferences(id, { topics: ["polls"], horizon: "fast", status: "completed" });
    await saveSettings(id, { rapidStake: 30, rapidSort: "closing" });
    assert.equal(await needsSurvey(id), false);
  });

  console.log(`settings: ${passed} tests passed${failures.length ? `, ${failures.length} FAILED` : ""}`);
  if (failures.length) {
    console.error(`\n${failures.map((f) => `  ✗ ${f}`).join("\n\n")}\n`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
