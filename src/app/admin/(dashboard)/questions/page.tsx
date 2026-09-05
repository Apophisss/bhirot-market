import { getSuggestion } from "@/lib/inbox";
import { loadPeople } from "@/lib/content";
import { isoToIsraelLocal } from "@/lib/il-time";
import { NewQuestionForm, type PersonOption, type QuestionDraft } from "@/components/admin/NewQuestionForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "שאלה חדשה" };

/**
 * Publish a question straight to the board. The form is also where a user's
 * suggestion ends up: /admin/inbox links here with ?suggestion=<id> and the draft
 * arrives pre-filled.
 */
export default async function AdminNewQuestion({ searchParams }: { searchParams: Promise<{ suggestion?: string }> }) {
  const { suggestion } = await searchParams;

  const people: PersonOption[] = [...loadPeople().values()].map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    image: p.image,
  }));

  let draft: QuestionDraft | undefined;
  if (suggestion) {
    const s = await getSuggestion(Number(suggestion));
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

  return <NewQuestionForm people={people} draft={draft} />;
}
