import type { ReactNode } from "react";
import { findCategory } from "@/lib/categories";
import { listMarkets } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { QuestionIndex } from "@/components/QuestionIndex";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * The category segment's crawlable index of everything open in it.
 *
 * It lives in the layout rather than at the bottom of the page for one reason: the
 * page renders whatever slice the visitor asked for — twelve questions, or a search,
 * or a sort — while this list is the same complete list no matter which of those
 * variants a crawler happens to land on. Putting it here means every URL under
 * /category/<id> carries the full set of followed links, and the page above stays
 * about what the visitor asked to see.
 *
 * An unknown id is left entirely to the page, which answers a real 404 for it.
 */
export default async function CategoryLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { id } = await params;
  const cat = findCategory(id);
  if (!cat) return <>{children}</>;

  await ensureSynced();
  // closing first: the list doubles as "what is about to be decided in this category",
  // and the questions with a deadline in sight are the ones worth reading first
  const open = await listMarkets({ category: cat.id, status: "open", sort: "closing", limit: 600 });

  return (
    <div className="space-y-6">
      {children}
      <QuestionIndex
        heading={`כל השאלות הפתוחות ב${cat.label}`}
        items={open}
        note={`${open.length} שאלות פתוחות בקטגוריה, לפי סדר מועד הסגירה. המשחק בנקודות בלבד.`}
      />
    </div>
  );
}
