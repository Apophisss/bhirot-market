import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { adminAllowlistEmpty, currentAdmin } from "@/lib/admin";
import { getAdminStats } from "@/lib/admin-stats";
import { getSuggestion, listContactMessages, listSuggestions } from "@/lib/inbox";
import { loadPeople } from "@/lib/content";
import { ensureSynced } from "@/lib/sync";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { NewQuestionForm, type PersonOption, type QuestionDraft } from "@/components/admin/NewQuestionForm";
import { MessagesPanel, SuggestionsPanel } from "@/components/admin/InboxPanels";
import { isoToIsraelLocal } from "@/lib/il-time";
import { SITE_NAME } from "@/lib/config";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// the dashboard is private: it must never be indexed, and it has no public URL to share
export const metadata: Metadata = {
  title: "לוח ניהול",
  robots: { index: false, follow: false, nocache: true },
};

type Search = { tab?: string; suggestion?: string };

const TABS = [
  { id: "overview", label: "סקירה" },
  { id: "new", label: "שאלה חדשה" },
  { id: "suggestions", label: "הצעות משתמשים" },
  { id: "messages", label: "פניות" },
] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await currentAdmin();
  if (!admin) return <NoAccess />;

  await ensureSynced();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as string) : "overview";

  const [stats, messages, suggestions] = await Promise.all([
    getAdminStats(),
    listContactMessages("all", 200),
    listSuggestions("all", 200),
  ]);

  const people: PersonOption[] = [...loadPeople().values()].map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    image: p.image,
  }));

  let draft: QuestionDraft | undefined;
  if (tab === "new" && sp.suggestion) {
    const s = await getSuggestion(Number(sp.suggestion));
    if (s) {
      draft = {
        title: s.title,
        description: s.description,
        resolutionCriteria: s.resolutionCriteria,
        category: s.category,
        imageUrl: s.imageUrl ?? undefined,
        sourceUrl: s.sourceUrl ?? undefined,
        probabilityPct: s.probability ? Math.round(s.probability * 100) : undefined,
        closesAt: s.closesAt ? isoToIsraelLocal(s.closesAt) : undefined,
        suggestionId: s.id,
        suggestedBy: s.name || s.email || undefined,
      };
    }
  }

  const pending = stats.inbox.suggestionsPending;
  const unread = stats.inbox.messagesNew;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">לוח ניהול — {SITE_NAME}</h1>
          <p className="text-[13px] text-muted">
            מחובר/ת כ־<span dir="ltr">{admin.email}</span> · נתונים לרגע זה: {fmtDateTime(stats.generatedAt)}
          </p>
        </div>
        <div className="flex gap-2 text-[13px]">
          <Link href="/suggest" className="rounded-lg border border-border px-3 py-1.5 font-medium text-muted hover:bg-surface-2">
            טופס ההצעות הציבורי
          </Link>
          <Link href="/contact" className="rounded-lg border border-border px-3 py-1.5 font-medium text-muted hover:bg-surface-2">
            טופס יצירת הקשר
          </Link>
        </div>
      </header>

      <nav className="swipe-x scrollbar-none -mx-3 flex gap-1.5 px-3 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const badge = t.id === "suggestions" ? pending : t.id === "messages" ? unread : 0;
          const active = t.id === tab;
          return (
            <Link
              key={t.id}
              href={`/admin?tab=${t.id}`}
              className={`tap pressable flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold ${
                active ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted hover:bg-surface-2"
              }`}
            >
              {t.label}
              {badge > 0 && (
                <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/25" : "bg-no text-white"}`}>{badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {adminAllowlistEmpty() && (
        <p className="card border-warn/40 bg-warn/10 p-3 text-[13px] text-warn">
          משתנה הסביבה <code>ADMIN_EMAILS</code> ריק — אף אחד לא יכול להיכנס ללוח הזה.
        </p>
      )}

      {tab === "overview" && <AdminOverview stats={stats} />}

      {tab === "new" && <NewQuestionForm people={people} draft={draft} />}

      {tab === "suggestions" && (
        <SuggestionsPanel
          items={suggestions.map(({ row, userName, userImage }) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            title: row.title,
            description: row.description,
            resolutionCriteria: row.resolutionCriteria,
            category: row.category,
            imageUrl: row.imageUrl,
            probability: row.probability,
            sourceUrl: row.sourceUrl,
            closesAt: row.closesAt,
            status: row.status,
            adminNote: row.adminNote,
            publishedSlug: row.publishedSlug,
            createdAt: row.createdAt,
            userName,
            userImage,
          }))}
        />
      )}

      {tab === "messages" && (
        <MessagesPanel
          items={messages.map(({ row, userName, userImage }) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            topic: row.topic,
            body: row.body,
            status: row.status,
            adminNote: row.adminNote,
            createdAt: row.createdAt,
            userName,
            userImage,
          }))}
        />
      )}
    </div>
  );
}

/** Signed out, or signed in with an email that is not on the allowlist. */
async function NoAccess() {
  const session = await auth();
  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="card p-6 text-center sm:p-8">
        <h1 className="text-xl font-extrabold text-text-strong">אזור ניהול</h1>
        {session?.user ? (
          <>
            <p className="mt-2 text-sm text-muted">
              החשבון <span dir="ltr">{session.user.email}</span> אינו מורשה לגשת ללוח הניהול. הגישה פתוחה רק לכתובות שמופיעות
              ברשימת ההרשאות של האתר.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/" className="tap pressable flex items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-2">
                חזרה ללוח
              </Link>
              <Link href="/contact" className="tap pressable flex items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2">
                יצירת קשר עם הצוות
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">האזור הזה פתוח רק לצוות המערכת. התחברו עם חשבון מורשה כדי להמשיך.</p>
            <Link
              href="/login?callbackUrl=%2Fadmin"
              className="tap pressable mt-4 inline-flex items-center rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-2"
            >
              התחברות
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
