import Link from "next/link";
import { ELECTION_DATE, SITE_NAME } from "@/lib/config";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE } from "@/lib/rapid";
import { fmtDate } from "@/lib/format";
import { getLastAgentRun } from "@/lib/markets";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "איך זה עובד" };

export default async function AboutPage() {
  const last = await getLastAgentRun();
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-3xl font-black text-text-strong">איך {SITE_NAME} עובד</h1>
        <p className="mt-2 text-muted">
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
      </Section>

      <Section title="3. כסף וירטואלי">
        <p>
          כל משתמש/ת שמתחבר/ת עם Google מקבל/ת <strong>₪10,000 וירטואליים</strong>. אין דרך להפקיד או למשוך כסף, ואין שום ערך כספי לנקודות.
          לוח המובילים מדרג לפי שווי כולל (יתרה + שווי הפוזיציות במחירי השוק).
        </p>
      </Section>

      <Section title="4. מצב זריז — לענות על שאלות ברצף" id="rapid">
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

      <Section title="5. השאלות מתעדכנות כל שעה על ידי Claude" id="claude">
        <p>
          העורך של האתר הוא <strong>Claude</strong> (המודל של Anthropic). פעם בשעה רצה <strong>רוטינה</strong> שסורקת את החדשות הפוליטיות
          בישראל — סקרים חדשים, מהלכים של המפלגות, משפט נתניהו, חוק הגיוס, עימותים ותביעות — ומנסחת שאלות חיזוי חדשות, טקטיות וניתנות להכרעה:
          עם מועד יעד מפורש, קריטריוני הכרעה ברורים ומקורות. באותה ריצה Claude גם בודק אילו שווקים כבר הוכרעו במציאות ומסמן אותם,
          וכל הפוזיציות משולמות אוטומטית.
        </p>
        <p>
          כל שאלה שנוצרה אוטומטית מסומנת ב־🤖. השאלות והמקורות שמורים בקובץ פתוח בריפו (<code>data/markets.json</code>) כך שאפשר לעקוב אחרי כל שינוי.
        </p>
        {last && (
          <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <strong>העדכון האחרון</strong> ({timeAgo(last.createdAt)}, מקור: {last.source}): {last.summary}
            {last.added ? ` · נוספו ${last.added}` : ""}
            {last.resolved ? ` · הוכרעו ${last.resolved}` : ""}
          </p>
        )}
      </Section>

      <Section title="6. הכרעת שווקים">
        <p>
          כל שוק מגדיר במפורש מה נחשב ״כן״, מה נחשב ״לא״ ואיזה מקור מכריע (למשל: סקר שפורסם בערוץ מסוים, החלטת בית משפט, הודעה רשמית).
          שוק שהתברר כלא ניתן להכרעה מבוטל וכל ההשקעות מוחזרות. אם נראה לכם שהכרעה שגויה — כתבו בתגובות של השוק.
        </p>
      </Section>

      <Section title="7. גילוי נאות">
        <p>
          האתר הוא פרויקט קהילתי/הדגמתי ואינו קשור לאף מפלגה, מועמד או גוף תקשורת. השאלות מבוססות על פרסומים פומביים ואינן מהוות עמדה.
          תמונות של אישי ציבור מגיעות מ־Wikimedia Commons תחת רישיונות חופשיים. אין כאן ייעוץ, הימורים או כסף אמיתי.
        </p>
      </Section>

      <div className="flex gap-3">
        <Link href="/" className="rounded-xl bg-accent px-5 py-2.5 font-bold text-white hover:bg-accent-2">לשווקים</Link>
        <Link href="/rapid" className="rounded-xl border border-accent/40 bg-accent/10 px-5 py-2.5 font-semibold text-accent-2 hover:bg-accent/20">למצב זריז</Link>
        <Link href="/login" className="rounded-xl border border-border-2 px-5 py-2.5 font-semibold hover:bg-surface">התחברות</Link>
      </div>
    </article>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card space-y-3 p-5 text-[15px] leading-relaxed text-text">
      <h2 className="text-lg font-bold text-text-strong">{title}</h2>
      {children}
    </section>
  );
}
