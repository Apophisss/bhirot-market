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
import { FAQ, breadcrumbs, faqGraph, shareCard } from "@/lib/seo";
import { CATEGORIES } from "@/lib/categories";

export const dynamic = "force-dynamic";

const DESCRIPTION = `איך עובד ${SITE_NAME}: משחק ידע חינמי על הפוליטיקה הישראלית, בנקודות משחק בלבד — אין כסף אמיתי, אין פרסים ואין תשלום. מנוע התמחור LMSR והכרעת שאלות לפי מקורות פומביים.`;

export const metadata: Metadata = {
  title: "איך זה עובד — שאלות ותשובות",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  ...shareCard({ title: `איך זה עובד | ${SITE_NAME}`, description: DESCRIPTION, path: "/about" }),
};

export default async function AboutPage() {
  const last = await getLastAgentRun();
  return (
    <article className="mx-auto max-w-3xl space-y-5 sm:space-y-8">
      <JsonLd data={faqGraph()} />
      <JsonLd
        data={breadcrumbs([
          { name: "שאלות", path: "/" },
          { name: "איך זה עובד", path: "/about" },
        ])}
      />
      <header>
        <h1 className="text-2xl font-black text-text-strong sm:text-3xl">איך {SITE_NAME} עובד</h1>
        <p className="mt-2 text-[15px] text-muted">
          משחק ניחושים על הבחירות לכנסת ה־26 ({fmtDate(ELECTION_DATE)}) — בנקודות משחק בלבד. אין כסף אמיתי, אין פרסים ואין תשלום.
        </p>
      </header>

      <Section title="1. תשובות ״כן״ ו״לא״">
        <p>
          בכל שאלה יש שתי תשובות אפשריות, למשל <em>״האם ערוץ 14 יפרסם סקר שנותן לליכוד 30 מנדטים ומעלה עד 15.9?״</em>. אפשר לענות
          ״כן״ או ״לא״. כשהשאלה מוכרעת, כל תשובה של הצד הצודק שווה <strong>נקודה אחת</strong>, ותשובות הצד השני שוות אפס.
        </p>
        <p>
          מד הניחושים של ״כן״ (בין 0 ל־1) הוא כמה בטוחים השחקנים בתשובה ״כן״, והוא גם מה שכל תשובה כזו עולה. אם אתם חושבים שכולם
          טועים — ענו את הצד הזול ותצברו יותר נקודות אם צדקתם. אפשר גם לחזור בכם ולמכור תשובה בחזרה בכל רגע לפני ההכרעה.
        </p>
      </Section>

      <Section title="2. איך נקבע המחיר (LMSR)">
        <p>
          המחיר נקבע על ידי מנוע תמחור אוטומטי מסוג <strong>LMSR</strong> (Logarithmic Market Scoring Rule), אותו מנגנון שמשמש
          משחקי ניחושים אקדמיים. כל תשובת ״כן״ מעלה את המד, כל תשובת ״לא״ מורידה אותו, וגודל התזוזה תלוי בפרמטר הגמישות של השאלה.
          לכן תשובה גדולה מזיזה את המחיר נגדכם.
        </p>
        <p>
          מכאן נובע דבר אחד שכדאי להכיר: המחיר שמוצג הוא <strong>מחיר התשובה הבאה</strong>, לא השווי של כל מה שאתם מחזיקים. מכירה
          של כל התשובות בבת אחת מורידה את המחיר תוך כדי, ולכן <strong>תשובות × מחיר</strong> תמיד גבוה ממה שבאמת יתקבל. בניקוד
          שלכם מוצג המספר הנכון — ״שווי במכירה״ הוא בדיוק מה שיופיע בשורת ״תקבל/י״ ובדיוק מה שייכנס לניקוד אם תמכרו עכשיו.
        </p>
      </Section>

      <Section title="3. נקודות משחק">
        <p>
          כל שחקן/ית שמתחבר/ת עם Google מקבל/ת <strong>10,000 נקודות</strong>. הנקודות הן ניקוד במשחק ותו לא: אין דרך להפקיד,
          אין דרך למשוך, אין פרס ואין להן שום ערך כספי. לוח המובילים מדרג לפי ניקוד כולל (נקודות פנויות + שווי התשובות
          הפתוחות, כלומר מה שיתקבל עליהן במכירה עכשיו).
        </p>
        <p>
          <strong>לוח המובילים אנונימי.</strong> אף שם ואף תמונת פרופיל אינם מופיעים בו — כל שחקן/ית מקבל/ת כינוי אקראי וקבוע
          (״ינשוף ממושמע״), והשרת כלל לא שולח לדף את השמות. אתם מזהים רק את השורה שלכם, שמסומנת ב״את/ה״.
          לצד השחקנים האמיתיים מוצגים בלוח <strong>שחקני הדגמה</strong> שממחישים איך הוא נראה מלא: המספרים שלהם נוצרים
          בחישוב מקומי (<code>src/lib/fake-leaderboard.ts</code>), אינם נשמרים במסד הנתונים, אינם עונים על שאלות,
          ואינם משפיעים על אף מחיר, על מספר התשובות או על הניקוד של אף אחד.
        </p>
        <p>
          יש <strong>תקרה של {MAX_BET} נקודות לכל תשובה</strong> — בפאנל התשובה וגם במצב זריז — כדי שאף אחד לא יוכל להזיז שאלה
          במכה אחת. אפשר כמובן לענות שוב על אותה שאלה, ומכירה של תשובות שכבר יש לכם אינה מוגבלת.
        </p>
      </Section>

      <Section title="4. הזמנת חברים — בונוס על כל הרשמה" id="invite">
        <p>
          לכל משתמש/ת יש <Link href="/invite" className="text-accent-2 hover:underline">קישור אישי להזמנת חברים</Link>.
          כל מי שנרשם לאתר דרך הקישור הזה מזכה אתכם ב<strong>{money(REFERRAL_BONUS)}</strong> שנכנסות לניקוד
          מיד — עד {MAX_REFERRALS} חברים. אחר כך הקישור ממשיך לעבוד, פשוט בלי בונוס.
        </p>
        <p>
          הבונוס נספר בניקוד הכולל שלכם אבל <strong>לא ברווח/הפסד</strong>: אלה נקודות שקיבלתם, לא נקודות שצברתם בניחוש, ולכן
          לוח המובילים ממשיך למדוד את מה שהוא אמור למדוד. הזמנה של עצמכם, או של חשבון שכבר נרשם בעבר, לא מזכה.
        </p>
      </Section>

      <Section title="5. מצב זריז — לענות על שאלות ברצף" id="rapid">
        <p>
          ב<Link href="/rapid" className="text-accent-2 hover:underline">מצב זריז</Link> השאלות עוברות אחת אחרי השנייה בפיד
          שנפתח על מסך שלם: גוללים (או מחליקים) לשאלה הבאה, קוראים אותה, ועונים ״כן״ או ״לא״ בלחיצה אחת. בוחרים פעם אחת כמה
          נקודות לשים על כל תשובה — <strong>בטווח מחייב של {RAPID_MIN_STAKE} עד {RAPID_MAX_STAKE} נקודות</strong> — והוא נשאר
          קבוע עד שמשנים אותו, כך שאפשר לענות על עשרות שאלות ברצף בלי לחשב מחדש בכל פעם.
        </p>
        <p>
          <strong>כל תשובה מחייבת</strong>, ועוברת באותו מנוע תמחור (LMSR) של דף השאלה הרגיל: הנקודות יורדות מהניקוד מיד,
          ובתמורה מקבלים תשובות של הצד שבחרתם. אין ״ביטול״ — אבל אפשר תמיד למכור אותן בדף השאלה לפני ההכרעה. מספר הנקודות
          קבוע וידוע מראש; כמה תשובות יתקבלו הוא הערכה לפי המחיר ברגע הלחיצה.
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
          בישראל: סקרים חדשים, מהלכים של המפלגות, משפט נתניהו, חוק הגיוס, עימותים ותביעות. מכל אלה אנחנו מנסחים שאלות חדשות
          שאפשר להכריע: עם מועד יעד מפורש, קריטריוני הכרעה ברורים ומקורות. באותה הזדמנות אנחנו בודקים אילו שאלות כבר
          הוכרעו במציאות ומסמנים אותן, וכל התשובות משולמות בהתאם.
        </p>
        <p>
          כל שאלה שנוספה אחרי ההשקה נושאת את הקרדיט של {SITE_TEAM}. בדף של כל שאלה מופיעים קריטריוני ההכרעה
          והמקורות שעליהם היא מבוססת, כך שאפשר לבדוק כל הכרעה בעצמכם.
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
          מועד הגשת הרשימות, החלטה בישיבת הממשלה של יום ראשון, דיון בבג״ץ. אפשר לענות, לראות את ההכרעה תוך יום־יומיים,
          ולעבור לשאלה הבאה. הן מרוכזות בדף הבית תחת <em>״נסגר היום או מחר״</em>, ובכרטיס מופיעה ספירה לאחור בשעות.
        </p>
        <p>
          לצידן יש שאלות ארוכות יותר, על סקרי אוקטובר, על תוצאות הבחירות ועל הרכבת הממשלה, כדי שתמיד יהיה גם משהו
          להחזיק לטווח ארוך.
        </p>
      </Section>

      <Section title="8. הכרעת שאלות">
        <p>
          כל שאלה מגדירה במפורש מה נחשב ״כן״, מה נחשב ״לא״ ואיזה מקור מכריע (למשל: סקר שפורסם בערוץ מסוים, החלטת בית משפט, הודעה רשמית).
          שאלה שהתבררה כלא ניתנת להכרעה מבוטלת וכל הנקודות מוחזרות. אם נראה לכם שהכרעה שגויה — כתבו בתגובות של השאלה.
        </p>
      </Section>

      <Section title="9. הגרף ההיסטורי — אומדן, לא תשובות" id="estimate">
        <p>
          שאלה חדשה נפתחת עם נקודת מחיר אחת בלבד, ולכן הגרף שלה היה שטוח לגמרי עד לתשובה הראשונה. כדי שיהיה מה לראות,
          האתר מצייר לפני מועד הפתיחה <strong>קו מקווקו של אומדן</strong> — מגמה משוחזרת ולא תשובות שניתנו באמת.
          הקו המקווקו, הרקע המקווקו והתווית ״אומדן״ מסמנים בדיוק את הקטע הזה; כל מה שמימין לקו הפתיחה הוא נתון אמיתי.
        </p>
        <p>
          האומדן חסום בכוונה: הוא <strong>לעולם לא מתרחק מהמחיר הרשום ביותר מ־3 נקודות אחוז</strong> (ובשאלות
          קרובות ל־0% או ל־100% — הרבה פחות, למשל נקודת אחוז אחת בשאלה של 3%). המחיר הנוכחי, אחוז ה״כן״ שלפיו אתם עונים,
          מספר התשובות, כל תשובה וכל הכרעה — אמיתיים תמיד ואינם מושפעים מהאומדן. הנקודות המשוערות אינן נשמרות במסד הנתונים,
          אינן משפיעות על הניקוד או על לוח המובילים, והן נעלמות מאליהן ברגע שהשאלה צוברת תשובות אמיתיות.
        </p>
      </Section>

      <Section title="10. גילוי נאות">
        <p>
          האתר הוא פרויקט קהילתי/הדגמתי ואינו קשור לאף מפלגה, מועמד או גוף תקשורת. השאלות מבוססות על פרסומים פומביים ואינן מהוות עמדה.
          תמונות של אישי ציבור מגיעות מ־Wikimedia Commons תחת רישיונות חופשיים. אין כאן ייעוץ מכל סוג, אין כסף אמיתי ואין פרסים.
        </p>
        <p>
          <strong>מדידת שימוש.</strong> אנחנו מודדים איך משתמשים באתר כדי לדעת מה עובד: מדידה פנימית משלנו — בלי קוקי מעקב,
          המבקר מזוהה ב־hash שמתחלף כל יום, כתובת ה־IP עצמה לא נשמרת והאירועים נמחקים אוטומטית אחרי כמה חודשים — ולצידה{" "}
          <strong>Google Analytics</strong>, שמקבל צפיות בעמודים ואת הפעולות המרכזיות (תשובה, תשובה במצב זריז, תגובה) עם מזהה
          השאלה, ומניח קוקי משלו. השם, האימייל ותמונת הפרופיל שלכם אינם נשלחים לגוגל.
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
              className="tap pressable inline-flex min-w-11 items-center justify-center rounded-full border border-border bg-surface px-3.5 text-sm text-muted hover:border-border-2 hover:text-text-strong"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-2 sm:flex sm:gap-3">
        <Link href="/" className="tap pressable flex items-center justify-center rounded-xl bg-accent px-5 font-bold text-white hover:bg-accent-2">
          לשאלות
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
