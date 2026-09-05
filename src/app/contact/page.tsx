import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";
import { ContactForm } from "@/components/ContactForm";
import { breadcrumbs, shareCard } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const dynamic = "force-dynamic";

const DESCRIPTION = `יצירת קשר עם ${SITE_TEAM} של ${SITE_NAME}: שאלות על האתר, דיווח על טעות בשוק, באגים ורעיונות לשיפור.`;

export const metadata: Metadata = {
  title: "יצירת קשר",
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  ...shareCard({ title: `יצירת קשר | ${SITE_NAME}`, description: DESCRIPTION, path: "/contact" }),
};

export default async function ContactPage() {
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <JsonLd
        data={breadcrumbs([
          { name: "שאלות", path: "/" },
          { name: "יצירת קשר", path: "/contact" },
        ])}
      />
      <header>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">יצירת קשר עם צוות המערכת</h1>
        <p className="mt-1 text-[13px] text-muted sm:text-sm">
          שאלה על האתר, טעות בניסוח או בהכרעה של שוק, באג או רעיון לשיפור — כתבו לנו. כל הודעה מגיעה ישירות אל {SITE_TEAM}.
        </p>
        <p className="mt-2 text-[13px] text-muted">
          רוצים להציע שאלה חדשה ללוח?{" "}
          <Link href="/suggest" className="font-semibold text-accent-2 hover:underline">
            יש טופס נפרד להצעת שאלה
          </Link>
          .
        </p>
      </header>
      <ContactForm defaultName={user?.name} defaultEmail={user?.email} />
      <p className="text-[12px] leading-relaxed text-muted-2">
        ההודעה נשמרת אצלנו יחד עם האימייל שהשארתם, ומשמשת רק כדי לחזור אליכם בנוגע לפנייה. {SITE_NAME} הוא משחק בנקודות
        בלבד — אין כאן חשבונות אמיתיים, כסף אמיתי או ייעוץ.
      </p>
    </div>
  );
}
