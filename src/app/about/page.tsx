import Link from "next/link";
import type { Metadata } from "next";
import { ELECTION_DATE, SITE_NAME, SITE_TEAM } from "@/lib/config";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE } from "@/lib/rapid";
import { MAX_BET } from "@/lib/limits";
import { MAX_REFERRALS, REFERRAL_BONUS } from "@/lib/referral";
import { money } from "@/lib/format";
import { fmtDate } from "@/lib/format";
import { getLastAgentRun } from "@/lib/markets";
import { timeAgo } from "@/lib/format";
import { displayUpdatedAt } from "@/lib/display-stats";
import { JsonLd } from "@/components/JsonLd";
import { FAQ, breadcrumbs, faqGraph } from "@/lib/seo";
import { CATEGORIES } from "@/lib/categories";

export const dynamic = "force-dynamic";

const DESCRIPTION = `איך עובד ${SITE_NAME}: שוק חיזויים בכסף וירטואלי על בחירות 2026 לכנסת — מניות "כן" ו"לא", תמחור LMSR, ₪10,000 וירטואליים לכל משתמש, והכרעת שווקים לפי מקורות פומביים.`;

export const metadata: Metadata = {
  title: "איך זה עובד — שאלות ותשובות",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { url: "/about", title: `איך זה עובד | ${SITE_NAME}`, description: DESCRIPTION },
};

export default async function AboutPage() {
  const last = await getLastAgentRun();
  return (
    <article className="mx-auto max-w-3xl space-y-5 sm:space-y-8">
      <JsonLd data={faqGraph()} />
      <JsonLd
        data={breadcrumbs([
          { name: "שווקים", path: "/" },
          { name: "איך זה עובד", path: "/about" },
        ])}
      />
      <header>
        <h1 className="text-2xl font-black text-text-strong sm:text-3xl">איך {SITE_NAME} עובד</h1>
        <p className="mt-2 text-[15px] text-muted">
          שוק חיזויים בסגנון Polymarket על הבחירות לכנסת ה־26 ({fmtDate(ELECTION_DATE)}) — בכסף וירטואלי בלבד, בלי הימורים ובלי כסף אמיתי.
        </p>
      </header>

      <Section title="1. מניות של ״כן״ ו״לא״">
        <p>
          בכל שוק יש שאלה בינארית, למשל <em>״האם ערוץ 14 יפרסם סקר שנותן לליכוד 30 מנדטים ומעלה עד 15.9?״</em>. אפשר לקנות מניות
          ״כן״ או מניות ״לא״. כשהשוק מוכרע, כל מניה של הצד הצודק משלמת <strong>₪1 וירטואלי</strong>, ומניות הצד השני שוות אפס.
        </p>
        <p>
          מחיר מניית ״כן״ (בין 0 ל־1) הוא ההסתברות שהסוחרים מייחסים לתשובה ״כן״. אם אתם חושבים שהשוק טועה — קנו את הצד הזול ותרוויחו אם צדקתם.
          אפשר גם למכור מניות בחזרה לשוק בכל רגע לפני ההכרעה.
        </p>
      </Section>

      <Section title="2. איך נקבע המחיר (LMSR)">
        <p>
          אין כאן ספר פקודות: המחיר נקבע על ידי עושה שוק אוטומטי מסוג <strong>LMSR</strong> (Logarithmic Market Scoring Rule), אותו מנגנון שמשמש
          שוקי חיזויים אקדמיים. כל קנייה של ״כן״ מעלה את המחיר, כל קנייה של ״לא״ מורידה אותו, וגודל התזוזה תלוי בפרמטר הנזילות של השוק.
          לכן פוזיציה גדולה מזיזה את המחיר נגדכם — בדיוק כמו בשוק אמיתי.
        </p>
        <p>
          מכאן נובע דבר אחד שכדאי להכיר: המחיר שמוצג הוא <strong>מחיר המניה הבאה</strong>, לא השווי של כל החבילה. מכירה של פוזיציה
          שלמה מורידה את המחיר תוך כדי, ולכן <strong>מניות × מחיר</strong> תמיד גבוה ממה שבאמת יתקבל. בתיק שלכם מוצג המספר הנכון —
          ״שווי במכירה״ הוא בדיוק הסכום שיופיע בשורת ״תקבל/י״ בפאנל המסחר ובדיוק מה שייכנס ליתרה אם תמכרו עכשיו.
        </p>
      </Section>

      <Section title="3. כסף וירטואלי">
        <p>
          כל משתמש/ת שמתחבר/ת עם Google מקבל/ת <strong>₪10,000 וירטואליים</strong>. אין דרך להפקיד או למשוך כסף, ואין שום ערך כספי לנקודות.
          לוח המובילים מדרג לפי שווי כולל (יתרה + שווי הפוזיציות, כלומר מה שיתקבל עליהן במכירה עכשיו).
        </p>
        <p>
          <strong>לוח המובילים אנונימי.</strong> אף שם ואף תמונת פרופיל אינם מופיעים בו — כל סוחר/ת מקבל/ת כינוי אקראי וקבוע
          (״ינשוף ממושמע״), והשרת כלל לא שולח לדף את השמות. אתם מזהים רק את השורה שלכם, שמסומנת ב״את/ה״.
          לצד הסוחרים האמיתיים מוצגים בלוח <strong>סוחרי הדגמה</strong> שממחישים איך הוא נראה מלא: המספרים שלהם נוצרים
          בחישוב מקומי (<code>src/lib/fake-leaderboard.ts</code>), אינם נשמרים במסד הנתונים, אינם קונים ואינם מוכרים,
          ואינם משפיעים על אף מחיר, על נפח המסחר או על התיק של אף אחד.
        </p>
        <p>
          יש <strong>תקרה של ₪{MAX_BET} לכל עסקת קנייה</strong> — בפאנל המסחר וגם במצב זריז — כדי שאף אחד לא יוכל להזיז שוק
          במכה אחת. אפשר כמובן לקנות שוב באותו שוק, והמכירה של פוזיציה קיימת לא מוגבלת בסכום.
        </p>
      </Section>

      <Section title="4. הזמנת חברים — בונוס על כל הרשמה" id="invite">
        <p>
          לכל משתמש/ת יש <Link href="/invite" className="text-accent-2 hover:underline">קישור אישי להזמנת חברים</Link>.
          כל מי שנרשם לאתר דרך הקישור הזה מזכה אתכם ב<strong>{money(REFERRAL_BONUS)} וירטואליים</strong> שנכנסים ליתרה
          מיד — עד {MAX_REFERRALS} חברים. אחר כך הקישור ממשיך לעבוד, פשוט בלי בונוס.
        </p>
        <p>
          הבונוס נספר בשווי הכולל שלכם אבל <strong>לא ברווח/הפסד</strong>: הוא כסף שקיבלתם, לא כסף שהרווחתם מחיזוי, ולכן
          לוח המובילים ממשיך למדוד את מה שהוא אמור למדוד. הזמנה של עצמכם, או של חשבון שכבר נרשם בעבר, לא מזכה.
        </p>
      </Section>

      <Section title="5. מצב זריז — לענות על שאלות ברצף" id="rapid">
        <p>
          ב<Link href="/rapid" className="text-accent-2 hover:underline">מצב זריז</Link> השאלות עוברות אחת אחרי השנייה בפיד
          שנפתח על מסך שלם: גוללים (או מחליקים) לשאלה הבאה, קוראים אותה, ועונים ״כן״ או ״לא״ בלחיצה אחת. בוחרים פעם אחת סכום
          לכל תשובה — <strong>בטווח מחייב של ₪{RAPID_MIN_STAKE} עד ₪{RAPID_MAX_STAKE}</strong> — והוא נשאר קבוע עד שמשנים אותו,
          כך שאפשר לענות על עשרות שאלות ברצף בלי לחשב מחדש בכל פעם.
        </p>
        <p>
          <strong>כל תשובה היא קנייה מחייבת</strong> באותו עושה שוק (LMSR) של דף השוק הרגיל: הסכום יורד מהיתרה מיד, ובתמורה
          מקבלים מניות של הצד שבחרתם. אין ״ביטול״ — אבל אפשר תמיד למכור את הפוזיציה בדף השוק לפני ההכרעה. הסכום קבוע וידוע
          מראש; מספר המניות שיתקבל הוא הערכה לפי המחיר ברגע הלחיצה.
        </p>
        <p className="text-sm text-muted">
          במחשב אפשר לענות רק עם המקלדת: <kbd className="rounded bg-surface-2 px-1">→</kbd> כן,{" "}
          <kbd className="rounded bg-surface-2 px-1">←</kbd> לא, <kbd className="rounded bg-surface-2 px-1">רווח</kbd> דילוג,{" "}
          <kbd className="rounded bg-surface-2 px-1">+</kbd>/<kbd className="rounded bg-surface-2 px-1">−</kbd> שינוי הסכום.
          בטלפון אפשר גם להחליק את הכרטיס ימינה ל״כן״ ושמאלה ל״לא״. שאלות שכבר עניתם עליהן לא חוזרות בפיד.
        </p>
      </Section>

      <Section title="6. מי כותב את השאלות" id="updates">
        <p>
          מאחורי האתר עומד <strong>{SITE_TEAM}</strong> של {SITE_NAME}. אנחנו עוקבים לאורך היום אחרי החדשות הפוליטיות
          בישראל: סקרים חדשים, מהלכים של המפלגות, משפט נתניהו, חוק הגיוס, עימותים ותביעות. מכל אלה אנחנו מנסחים שאלות חיזוי
          חדשות שאפשר להכריע: עם מועד יעד מפורש, קריטריוני הכרעה ברורים ומקורות. באותה הזדמנות אנחנו בודקים אילו שווקים כבר
          הוכרעו במציאות ומסמנים אותם, וכל הפוזיציות משולמות בהתאם.
        </p>
        <p>
          כל שאלה שנוספה אחרי ההשקה נושאת את הקרדיט של {SITE_TEAM}. בדף של כל שוק מופיעים קריטריוני ההכרעה
          והמקורות שעליהם השאלה מבוססת, כך שאפשר לבדוק כל הכרעה בעצמכם.
        </p>
        {last && (
          <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <strong>העדכון האחרון</strong> ({timeAgo(displayUpdatedAt(last.createdAt))}): {last.summary}
            {last.added ? ` · נוספו ${last.added}` : ""}
            {last.resolved ? ` · הוכרעו ${last.resolved}` : ""}
          </p>
        )}
      </Section>

      <Section title="7. שאלות של היום ומחר">
        <p>
          חלק גדול מהשאלות באתר נסגרות תוך <strong>24 עד 72 שעות</strong>: סקר שיפורסם במהדורה של הערב, הכרזת מיזוג לפני
          מועד הגשת הרשימות, החלטה בישיבת הממשלה של יום ראשון, דיון בבג״ץ. אפשר לקנות, לראות את ההכרעה תוך יום־יומיים,
          ולעבור לשאלה הבאה. הן מרוכזות בדף הבית תחת <em>״נסגר היום או מחר״</em>, ובכרטיס מופיעה ספירה לאחור בשעות.
        </p>
        <p>
          לצידן יש שאלות ארוכות יותר, על סקרי אוקטובר, על תוצאות הבחירות ועל הרכבת הממשלה, כדי שתמיד יהיה גם משהו
          להחזיק לטווח ארוך.
        </p>
      </Section>

      <Section title="8. הכרעת שווקים">
        <p>
          כל שוק מגדיר במפורש מה נחשב ״כן״, מה נחשב ״לא״ ואיזה מקור מכריע (למשל: סקר שפורסם בערוץ מסוים, החלטת בית משפט, הודעה רשמית).
          שוק שהתברר כלא ניתן להכרעה מבוטל וכל ההשקעות מוחזרות. אם נראה לכם שהכרעה שגויה — כתבו בתגובות של השוק.
        </p>
      </Section>

      <Section title="9. הגרף ההיסטורי — אומדן, לא מסחר" id="estimate">
        <p>
          שוק חדש נפתח עם נקודת מחיר אחת בלבד, ולכן הגרף שלו היה שטוח לגמרי עד לעסקה הראשונה. כדי שיהיה מה לראות,
          האתר מצייר לפני מועד הפתיחה <strong>קו מקווקו של אומדן</strong> — מגמה משוחזרת ולא מסחר שקרה באמת.
          הקו המקווקו, הרקע המקווקו והתווית ״אומדן״ מסמנים בדיוק את הקטע הזה; כל מה שמימין לקו ״פתיחת המסחר״ הוא נתון אמיתי.
        </p>
        <p>
          האומדן חסום בכוונה: הוא <strong>לעולם לא מתרחק מהמחיר הרשום ביותר מ־3 נקודות אחוז</strong> (ובשווקים
          קרובים ל־0% או ל־100% — הרבה פחות, למשל 1 נקודה בשוק של 3%). המחיר הנוכחי, אחוז ה״כן״ שאתם קונים לפיו,
          נפח המסחר, כל עסקה וכל הכרעה — אמיתיים תמיד ואינם מושפעים מהאומדן. הנקודות המשוערות אינן נשמרות במסד הנתונים,
          אינן משפיעות על התיק או על לוח המובילים, והן נעלמות מאליהן ברגע שהשוק צובר מסחר אמיתי.
        </p>
      </Section>

      <Section title="10. גילוי נאות">
        <p>
          האתר הוא פרויקט קהילתי/הדגמתי ואינו קשור לאף מפלגה, מועמד או גוף תקשורת. השאלות מבוססות על פרסומים פומביים ואינן מהוות עמדה.
          תמונות של אישי ציבור מגיעות מ־Wikimedia Commons תחת רישיונות חופשיים. אין כאן ייעוץ, הימורים או כסף אמיתי.
        </p>
        <p>
          <strong>מדידת שימוש.</strong> אנחנו מודדים איך משתמשים באתר כדי לדעת מה עובד: מדידה פנימית משלנו — בלי קוקי מעקב,
          המבקר מזוהה ב־hash שמתחלף כל יום, כתובת ה־IP עצמה לא נשמרת והאירועים נמחקים אוטומטית אחרי כמה חודשים — ולצידה{" "}
          <strong>Google Analytics</strong>, שמקבל צפיות בעמודים ואת הפעולות המרכזיות (עסקה, תשובה במצב זריז, תגובה) עם מזהה
          השוק, ומניח קוקי משלו. השם, האימייל ותמונת הפרופיל שלכם אינם נשלחים לגוגל.
        </p>
      </Section>

      <section id="faq" className="space-y-3">
        <h2 className="text-xl font-black text-text-strong sm:text-2xl">שאלות ותשובות</h2>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="card group p-3.5 sm:p-4">
              <summary className="flex cursor-pointer list-none items-start py-1 font-bold text-text-strong marker:content-none">
                <span className="me-2 mt-1.5 inline-flex shrink-0 text-muted-2 transition group-open:rotate-180 group-open:text-accent">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
                {f.q}
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-text">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-black text-text-strong sm:text-2xl">הקטגוריות באתר</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.id}`}
              className="pressable rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-muted hover:border-border-2 hover:text-text-strong"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-2 sm:flex sm:gap-3">
        <Link href="/" className="tap pressable flex items-center justify-center rounded-xl bg-accent px-5 font-bold text-white hover:bg-accent-2">
          לשווקים
        </Link>
        <Link
          href="/rapid"
          className="tap pressable flex items-center justify-center rounded-xl border border-accent/40 bg-accent/10 px-5 font-semibold text-accent-2 hover:bg-accent/20"
        >
          למצב זריז
        </Link>
        <Link href="/login" className="tap pressable flex items-center justify-center rounded-xl border border-border-2 px-5 font-semibold hover:bg-surface">
          התחברות
        </Link>
      </div>
    </article>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20 space-y-3 p-4 text-[15px] leading-relaxed text-text sm:p-5">
      <h2 className="text-lg font-bold text-text-strong">{title}</h2>
      {children}
    </section>
  );
}
