import Link from "next/link";
import type { Metadata } from "next";
import { ELECTION_DATE, SITE_NAME, SITE_TEAM } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import { getLastAgentRun } from "@/lib/markets";
import { timeAgo } from "@/lib/format";
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
    <article className="mx-auto max-w-3xl space-y-8">
      <JsonLd data={faqGraph()} />
      <JsonLd
        data={breadcrumbs([
          { name: "שווקים", path: "/" },
          { name: "איך זה עובד", path: "/about" },
        ])}
      />
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

      <Section title="4. השאלות מתעדכנות כל שעה על ידי צוות המערכת" id="updates">
        <p>
          מאחורי האתר עומד <strong>{SITE_TEAM}</strong> של {SITE_NAME}. פעם בשעה אנחנו עוברים על החדשות הפוליטיות
          בישראל — סקרים חדשים, מהלכים של המפלגות, משפט נתניהו, חוק הגיוס, עימותים ותביעות — ומנסחים שאלות חיזוי חדשות, טקטיות וניתנות להכרעה:
          עם מועד יעד מפורש, קריטריוני הכרעה ברורים ומקורות. באותו מעבר אנחנו גם בודקים אילו שווקים כבר הוכרעו במציאות ומסמנים אותם,
          וכל הפוזיציות משולמות אוטומטית.
        </p>
        <p>
          כל שאלה שהוסיף {SITE_TEAM} אחרי ההשקה מסומנת ב־✍️. השאלות והמקורות שמורים בקובץ פתוח בריפו (<code>data/markets.json</code>)
          כך שאפשר לעקוב אחרי כל שינוי.
        </p>
        {last && (
          <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <strong>העדכון האחרון</strong> ({timeAgo(last.createdAt)}): {last.summary}
            {last.added ? ` · נוספו ${last.added}` : ""}
            {last.resolved ? ` · הוכרעו ${last.resolved}` : ""}
          </p>
        )}
      </Section>

      <Section title="5. שאלות של היום ומחר">
        <p>
          חלק גדול מהשאלות באתר נסגרות תוך <strong>24 עד 72 שעות</strong>: סקר שיפורסם במהדורה של הערב, הכרזת מיזוג לפני
          מועד הגשת הרשימות, החלטה בישיבת הממשלה של יום ראשון, דיון בבג״ץ. אפשר לקנות, לראות את ההכרעה תוך יום־יומיים,
          ולחזור לשאלה הבאה. הן מרוכזות בדף הבית תחת <em>״נסגר היום או מחר״</em>, ובכרטיס מופיעה ספירה לאחור בשעות.
        </p>
        <p>
          לצידן יש שאלות ארוכות יותר — על סקרי אוקטובר, על תוצאות הבחירות ועל הרכבת הממשלה — כדי שתמיד יהיה גם משהו
          להחזיק לטווח ארוך.
        </p>
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

      <section id="faq" className="space-y-3">
        <h2 className="text-2xl font-black text-text-strong">שאלות ותשובות</h2>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="card group p-4">
              <summary className="cursor-pointer list-none font-bold text-text-strong marker:content-none">
                <span className="me-2 text-muted-2 transition group-open:text-accent">▾</span>
                {f.q}
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-text">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-black text-text-strong">הקטגוריות באתר</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.id}`}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:border-border-2 hover:text-text-strong"
            >
              <span className="me-1">{c.emoji}</span>
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        <Link href="/" className="rounded-xl bg-accent px-5 py-2.5 font-bold text-white hover:bg-accent-2">לשווקים</Link>
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
