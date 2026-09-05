import { getInboxCounts, listContactMessages, listSuggestions } from "@/lib/inbox";
import { Kpi } from "@/components/admin/Charts";
import { MessagesPanel, SuggestionsPanel } from "@/components/admin/InboxPanels";

export const dynamic = "force-dynamic";
export const metadata = { title: "תיבה" };

/** Everything users sent in: proposed questions on the left tab, messages on the right. */
export default async function AdminInbox({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const messagesFirst = view === "messages";
  const [counts, suggestions, messages] = await Promise.all([
    getInboxCounts(),
    listSuggestions("all", 200),
    listContactMessages("all", 200),
  ]);

  const suggestionsPanel = (
    <section className="space-y-3">
      <h2 className="font-bold text-text-strong">הצעות שאלה ממשתמשים</h2>
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
    </section>
  );

  const messagesPanel = (
    <section className="space-y-3">
      <h2 className="font-bold text-text-strong">פניות מהטופס ״יצירת קשר״</h2>
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
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="הצעות שממתינות"
          value={String(counts.suggestionsPending)}
          tone={counts.suggestionsPending > 0 ? "no" : "neutral"}
          hint={`${counts.suggestionsTotal} בסך הכול · ${counts.suggestionsApproved} אושרו`}
        />
        <Kpi label="הצעות שהגיעו השבוע" value={String(counts.suggestions7d)} hint="מהטופס ב-/suggest" />
        <Kpi
          label="פניות חדשות"
          value={String(counts.messagesNew)}
          tone={counts.messagesNew > 0 ? "no" : "neutral"}
          hint={`${counts.messagesOpen} בטיפול · ${counts.messagesTotal} בסך הכול`}
        />
        <Kpi label="פניות שהגיעו השבוע" value={String(counts.messages7d)} hint="מהטופס ב-/contact" />
      </div>

      {/* whichever queue the operator came for goes first; ?view=messages flips the order */}
      {messagesFirst ? (
        <>
          {messagesPanel}
          {suggestionsPanel}
        </>
      ) : (
        <>
          {suggestionsPanel}
          {messagesPanel}
        </>
      )}
    </div>
  );
}
