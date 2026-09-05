import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";
import { SuggestQuestionForm } from "@/components/SuggestQuestionForm";
import { listUserSuggestions } from "@/lib/inbox";
import { fmtDate, timeAgo } from "@/lib/format";
import { getCategory } from "@/lib/categories";
import { breadcrumbs, shareCard } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const dynamic = "force-dynamic";

const DESCRIPTION = `הציעו שאלה חדשה ללוח של ${SITE_NAME}: אירוע פוליטי עם מועד יעד ומקור מכריע. ${SITE_TEAM} בודק כל הצעה ומפרסם את השאלות שעומדות בכללים.`;

export const metadata: Metadata = {
  title: "הצעת שאלה חדשה",
  description: DESCRIPTION,
  alternates: { canonical: "/suggest" },
  ...shareCard({ title: `הצעת שאלה חדשה | ${SITE_NAME}`, description: DESCRIPTION, path: "/suggest" }),
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "ממתינה לבדיקה", className: "bg-surface-3 text-muted" },
  approved: { label: "אושרה", className: "bg-yes/15 text-yes" },
  rejected: { label: "לא אושרה", className: "bg-no/15 text-no" },
};

export default async function SuggestPage() {
  const user = await currentUser();
  const mine = user ? await listUserSuggestions(user.id) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <JsonLd
        data={breadcrumbs([
          { name: "שווקים", path: "/" },
          { name: "הצעת שאלה", path: "/suggest" },
        ])}
      />
      <header>
        <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">הצעת שאלה חדשה ללוח</h1>
        <p className="mt-1 text-[13px] text-muted sm:text-sm">
          ראיתם משהו בחדשות שאפשר להמר עליו? כתבו את השאלה, מתי היא נסגרת ואיך מכריעים אותה. {SITE_TEAM} עובר על ההצעות,
          מתמחר את שמתאים ומפרסם ללוח. אין צורך להתחבר —{" "}
          {user ? "אתם מחוברים, אז נעדכן אתכם כאן." : (
            <>
              אבל אם{" "}
              <Link href="/login" className="font-semibold text-accent-2 hover:underline">
                תתחברו
              </Link>{" "}
              תוכלו לעקוב כאן אחרי מה שהצעתם.
            </>
          )}
        </p>
      </header>

      <SuggestQuestionForm loggedIn={Boolean(user)} defaultName={user?.name} defaultEmail={user?.email} />

      {mine.length > 0 && (
        <section className="card p-3.5 sm:p-4">
          <h2 className="mb-3 font-bold text-text-strong">ההצעות שלכם ({mine.length})</h2>
          <ul className="divide-y divide-border">
            {mine.map((s) => {
              const badge = STATUS_LABEL[s.status] ?? STATUS_LABEL.pending;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-text">{s.title}</span>
                  <span className="text-[11px] text-muted-2">{getCategory(s.category).label}</span>
                  <span className="text-[11px] text-muted-2">{timeAgo(s.createdAt)}</span>
                  {s.publishedSlug && (
                    <Link href={`/market/${s.publishedSlug}`} className="text-[12px] font-semibold text-accent-2 hover:underline">
                      לשוק שנפתח
                    </Link>
                  )}
                  {s.adminNote && <p className="w-full text-[12px] text-muted">הערת המערכת: {s.adminNote}</p>}
                  {s.closesAt && <span className="w-full text-[11px] text-muted-2">מועד יעד שהוצע: {fmtDate(s.closesAt)}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
