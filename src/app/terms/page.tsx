import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL_UPDATED, SITE_NAME, SITE_TEAM } from "@/lib/config";
import { STARTING_BALANCE } from "@/lib/db/schema";
import { MAX_BET } from "@/lib/limits";
import { fmtDate, money } from "@/lib/format";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbs } from "@/lib/seo";
import { LegalSection } from "@/components/LegalSection";

const DESCRIPTION = `תנאי השימוש של ${SITE_NAME}: משחק חיזויים בכסף וירטואלי בלבד, ללא הימורים, ללא כסף אמיתי וללא פרסים.`;

export const metadata: Metadata = {
  title: "תנאי שימוש",
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: { url: "/terms", title: `תנאי שימוש | ${SITE_NAME}`, description: DESCRIPTION },
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <JsonLd
        data={breadcrumbs([
          { name: "שווקים", path: "/" },
          { name: "תנאי שימוש", path: "/terms" },
        ])}
      />
      <header>
        <h1 className="text-2xl font-black text-text-strong sm:text-3xl">תנאי שימוש</h1>
        <p className="mt-2 text-[15px] text-muted">עודכן לאחרונה: {fmtDate(LEGAL_UPDATED)}</p>
      </header>

      <div className="rounded-card border border-warn/40 bg-warn/10 p-4 text-[15px] leading-relaxed text-text sm:p-5">
        <strong className="text-text-strong">בשורה אחת:</strong> זהו משחק בכסף וירטואלי בלבד. אין הימורים, אין כסף אמיתי,
        אין פרסים, ואי אפשר להפקיד או למשוך דבר. ״הרווח״ שלכם הוא מספר על מסך.
      </div>

      <LegalSection title="1. מה השירות">
        <p>
          {SITE_NAME} הוא משחק חיזויים על אירועים פוליטיים בישראל, ובראשם הבחירות לכנסת ה־26. כל משתמש מקבל{" "}
          <strong>{money(STARTING_BALANCE)} וירטואליים</strong> וקונה בהם מניות ״כן״ או ״לא״ בשאלות שונות. תקרת העסקה היא{" "}
          {money(MAX_BET)} וירטואליים.
        </p>
      </LegalSection>

      <LegalSection title="2. אין כאן הימורים">
        <p>
          המטבע באתר הוא וירטואלי לחלוטין ואין לו שווי כספי, שער המרה או אפשרות מימוש. אין תשלום כניסה, אין רכישות בתוך
          המשחק, ואין פרס — כספי או אחר — למי שמוביל בלוח המובילים. אנחנו לא מפעילים הגרלה, אין באתר משחק אסור כהגדרתו
          בחוק, ואין בו כל שירות פיננסי.
        </p>
      </LegalSection>

      <LegalSection title="3. גיל">
        <p>השימוש מותר מגיל 18 ומעלה בלבד.</p>
      </LegalSection>

      <LegalSection title="4. מי כותב ומכריע את השאלות">
        <p>
          השאלות נכתבות, מתומחרות ומוכרעות על ידי {SITE_TEAM} על בסיס פרסומים פומביים, לפי קריטריון ההכרעה שמופיע בכל שאלה.
          החלטת ההכרעה סופית. אם שאלה מנוסחת באופן שלא מאפשר הכרעה חד־משמעית, או אם האירוע התייתר, אנחנו רשאים לבטל אותה
          ולהחזיר את הכסף הווירטואלי לכל מי שסחר בה.
        </p>
        <p>
          המחירים באתר משקפים את דעת המשתתפים במשחק — <strong>הם אינם תחזית, המלצה, ייעוץ או מידע מקצועי</strong> מכל סוג,
          ואין להסתמך עליהם לשום החלטה.
        </p>
      </LegalSection>

      <LegalSection title="5. התנהגות">
        <p>אסור: לפתוח חשבונות מרובים, להשתמש בכלים אוטומטיים למסחר, לנסות לעקוף את תקרות ההימור, או לפרסם בתגובות תוכן פוגעני, מסית, מאיים או מסחרי.</p>
        <p>אנחנו רשאים למחוק תגובה, לאפס יתרה או לחסום חשבון שמפר את הכללים, לפי שיקול דעתנו ובלי הודעה מוקדמת.</p>
      </LegalSection>

      <LegalSection title="6. זמינות ואחריות">
        <p>
          השירות מסופק כמות שהוא (AS IS). איננו מתחייבים לזמינות רציפה, לשמירת היתרה הווירטואלית או לדיוק התוכן, ואנחנו
          רשאים לשנות או להפסיק את השירות בכל עת. מאחר שאין כאן כסף אמיתי, אין נזק כספי — ובכל מקרה איננו אחראים לכל נזק
          שייגרם משימוש באתר או מהסתמכות על תוכנו.
        </p>
      </LegalSection>

      <LegalSection title="7. קניין רוחני">
        <p>
          התוכן שנכתב על ידי {SITE_TEAM} שייך לאתר. תמונות אישי הציבור מקורן ב־Wikimedia Commons ומשמשות לפי רישיונן.
          בכתיבת תגובה אתם מעניקים לנו רישיון להציג אותה באתר.
        </p>
      </LegalSection>

      <LegalSection title="8. שינויים ודין">
        <p>
          נוכל לעדכן את התנאים; המשך שימוש אחרי עדכון מהווה הסכמה לגרסה החדשה. על התנאים חלים דיני מדינת ישראל, וסמכות
          השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל.
        </p>
        <p>
          לכל שאלה או בקשה:{" "}
          <Link href="/contact" className="text-accent hover:underline">טופס יצירת הקשר</Link>.
        </p>
      </LegalSection>

      <p className="text-center text-sm text-muted">
        ראו גם:{" "}
        <Link href="/privacy" className="text-accent hover:underline">מדיניות פרטיות</Link>
        {" · "}
        <Link href="/about" className="text-accent hover:underline">איך זה עובד</Link>
      </p>
    </article>
  );
}
