import Link from "next/link";
import type { Metadata } from "next";
import { CONTACT_EMAIL, LEGAL_UPDATED, SITE_NAME } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbs } from "@/lib/seo";
import { LegalSection } from "@/components/LegalSection";
import { analyticsEnabled } from "@/lib/analytics";

const DESCRIPTION = `מדיניות הפרטיות של ${SITE_NAME}: אילו נתונים נאספים, למה, אילו עוגיות בשימוש ואיך מוחקים חשבון.`;

export const metadata: Metadata = {
  title: "מדיניות פרטיות",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy", title: `מדיניות פרטיות | ${SITE_NAME}`, description: DESCRIPTION },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <JsonLd
        data={breadcrumbs([
          { name: "שווקים", path: "/" },
          { name: "מדיניות פרטיות", path: "/privacy" },
        ])}
      />
      <header>
        <h1 className="text-2xl font-black text-text-strong sm:text-3xl">מדיניות פרטיות</h1>
        <p className="mt-2 text-[15px] text-muted">עודכן לאחרונה: {fmtDate(LEGAL_UPDATED)}</p>
      </header>

      <LegalSection title="מה זה האתר">
        <p>
          {SITE_NAME} הוא משחק חיזויים <strong>בכסף וירטואלי בלבד</strong> על הבחירות לכנסת ה־26. אין באתר תשלומים, אין פרסים
          כספיים ואין אפשרות להפקיד או למשוך כסף. אנחנו לא אוספים פרטי אשראי, ואין לנו מה לעשות איתם.
        </p>
      </LegalSection>

      <LegalSection title="אילו נתונים נאספים">
        <p>כשמתחברים עם חשבון Google, אנחנו מקבלים מגוגל ושומרים אצלנו:</p>
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li><strong className="text-text">שם תצוגה, כתובת אימייל ותמונת פרופיל</strong> — כדי להציג אתכם בלוח המובילים, בתגובות ובתיק האישי.</li>
          <li><strong className="text-text">פעילות המשחק</strong> — העסקאות שביצעתם, הפוזיציות שלכם, היתרה הווירטואלית והתגובות שכתבתם.</li>
          <li><strong className="text-text">מקור ההגעה</strong> — אם הגעתם דרך מודעה, נשמר מזהה הקליק של גוגל (gclid) ופרמטרי הקמפיין, כדי שנדע אילו מודעות עובדות.</li>
        </ul>
        <p>
          אנחנו <strong>לא</strong> מבקשים מספר טלפון, כתובת, תעודת זהות או כל פרט מזהה אחר, ואין באתר טופס שמאפשר למסור אותם.
        </p>
      </LegalSection>

      <LegalSection title="עוגיות">
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li><strong className="text-text">עוגיית התחברות</strong> — הכרחית. בלעדיה אי אפשר להישאר מחוברים.</li>
          <li><strong className="text-text">עוגיית מקור הגעה</strong> (<code className="rounded bg-surface-2 px-1">bm_attr</code>) — שומרת את פרמטרי הקמפיין שהגעתם איתם, ל־90 יום.</li>
          {analyticsEnabled && (
            <li><strong className="text-text">עוגיות מדידה של Google</strong> — Google Analytics ו־Google Ads, לספירת ביקורים והרשמות.</li>
          )}
        </ul>
        <p>
          העדפות תצוגה מקומיות (כמו סכום ההימור שבחרתם ב״מצב זריז״) נשמרות ב־<code className="rounded bg-surface-2 px-1">localStorage</code> בדפדפן שלכם
          ולא נשלחות אלינו כלל.
        </p>
      </LegalSection>

      {analyticsEnabled && (
        <LegalSection title="שירותי מדידה של צד שלישי">
          <p>
            אנחנו משתמשים ב־Google Analytics ו־Google Ads כדי להבין כמה אנשים מגיעים לאתר ומאיפה. השירותים האלה מקבלים נתוני
            שימוש כלליים (דפים שנצפו, סוג מכשיר, מקור ההגעה) — לא את השם או האימייל שלכם. השימוש שגוגל עושה בנתונים כפוף
            למדיניות שלה:{" "}
            <a className="text-accent hover:underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              policies.google.com/privacy
            </a>
            . אפשר לחסום את המדידה בעזרת תוסף חוסם פרסומות או הגדרות הדפדפן, וזה לא יפגע בשימוש באתר.
          </p>
        </LegalSection>
      )}

      <LegalSection title="עם מי הנתונים משותפים">
        <p>
          אנחנו לא מוכרים נתונים ולא מעבירים אותם למפרסמים. הגורמים היחידים שנחשפים אליהם הם ספקי התשתית שמריצים את
          האתר — שירות ההתחברות של Google, ספק האחסון וספק מסד הנתונים — וזאת רק כדי שהאתר יעבוד.
        </p>
        <p>
          שימו לב: <strong>שם התצוגה, התמונה והפעילות שלכם גלויים לכל מבקר</strong> בלוח המובילים, בפיד הפעילות ובתגובות.
          כתובת האימייל שלכם לעולם לא מוצגת.
        </p>
      </LegalSection>

      <LegalSection title="כמה זמן וזכויותיכם">
        <p>
          הנתונים נשמרים כל עוד החשבון קיים. אתם רשאים לעיין בנתונים שנשמרו עליכם, לתקן אותם או לבקש למחוק את החשבון
          כולו — לרבות היתרה, הפוזיציות והתגובות. מחיקה היא סופית ולא ניתנת לשחזור.
        </p>
        {CONTACT_EMAIL ? (
          <p>
            לבקשות עיון, תיקון או מחיקה:{" "}
            <a className="text-accent hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . נשתדל להשיב תוך 14 יום.
          </p>
        ) : null}
      </LegalSection>

      <LegalSection title="קטינים ושינויים">
        <p>
          האתר מיועד לגילאי 18 ומעלה. אם התחברתם ואתם מתחת לגיל 18, אנא הפסיקו להשתמש בו{CONTACT_EMAIL ? " ופנו אלינו למחיקת החשבון" : ""}.
        </p>
        <p>
          אם נשנה את המדיניות, נעדכן את התאריך בראש העמוד. שינוי מהותי יוצג גם כהודעה באתר.
        </p>
      </LegalSection>

      <p className="text-center text-sm text-muted">
        ראו גם:{" "}
        <Link href="/terms" className="text-accent hover:underline">תנאי שימוש</Link>
        {" · "}
        <Link href="/about" className="text-accent hover:underline">איך זה עובד</Link>
      </p>
    </article>
  );
}
