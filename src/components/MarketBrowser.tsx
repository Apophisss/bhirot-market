import Link from "next/link";
import type { MarketSort, MarketView } from "@/lib/markets";
import { MarketCard } from "./MarketCard";
import { CategoryTabs } from "./CategoryTabs";

export const SORTS: { id: MarketSort; label: string }[] = [
  { id: "trending", label: "חם" },
  { id: "newest", label: "חדש" },
  { id: "closing", label: "נסגר בקרוב" },
  { id: "volume", label: "נפח" },
];

export const PAGE = 36;

export type BrowseParams = { q?: string; sort?: string; status?: string; show?: string };

export function parseSort(sort?: string): MarketSort {
  return SORTS.find((s) => s.id === sort)?.id ?? "trending";
}

export function browseHref(basePath: string, params: BrowseParams): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    if (k === "status" && v === "open") continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Category tabs + sort/status filters + the market grid. Shared by the home page
 * and by every /category/<id> landing page so both stay in sync.
 */
export function MarketBrowser({
  basePath,
  category,
  params,
  items,
  shown,
  total,
  counts,
}: {
  basePath: string;
  /** active category id, or "all" on the home page */
  category: string;
  params: BrowseParams;
  items: MarketView[];
  shown: number;
  total: number;
  counts?: Record<string, number>;
}) {
  const status = params.status === "resolved" ? "resolved" : "open";
  const sort = parseSort(params.sort);
  const q = params.q?.trim() || undefined;
  const link = (patch: BrowseParams) => browseHref(basePath, { ...params, ...patch });

  return (
    <section className="space-y-3">
      <CategoryTabs active={category} params={{ q, sort: params.sort, status: params.status }} counts={counts} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm">
          <Link
            href={link({ status: "open", show: undefined })}
            className={`rounded-lg px-3 py-1.5 font-semibold ${status === "open" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
          >
            פתוחים
          </Link>
          <Link
            href={link({ status: "resolved", show: undefined })}
            className={`rounded-lg px-3 py-1.5 font-semibold ${status === "resolved" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
          >
            הוכרעו
          </Link>
          {q && (
            <span className="ms-2 flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted">
              חיפוש: <strong className="text-text">{q}</strong>
              <Link href={link({ q: undefined })} className="ms-1 text-muted-2 hover:text-no" aria-label="נקה חיפוש">✕</Link>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="me-1 text-muted-2">מיון:</span>
          {SORTS.map((s) => (
            <Link
              key={s.id}
              href={link({ sort: s.id })}
              className={`rounded-md px-2 py-1 font-semibold ${sort === s.id ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
              rel="nofollow"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
          {total > shown && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Link
                href={link({ show: String(shown + PAGE) })}
                className="rounded-xl border border-border-2 bg-surface px-6 py-2.5 font-semibold text-text hover:bg-surface-2"
                scroll={false}
                rel="nofollow"
              >
                הצגת עוד שאלות
              </Link>
              <span className="tabular text-xs text-muted-2">
                {shown} מתוך {total}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="card p-12 text-center text-muted">
          <div className="text-4xl">🤷</div>
          <p className="mt-2">
            לא נמצאו שווקים. נסו קטגוריה אחרת או{" "}
            <Link href="/" className="text-accent-2 hover:underline">
              נקו את הסינון
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}
