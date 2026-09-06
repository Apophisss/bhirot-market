import Link from "next/link";
import type { MarketSort, MarketView } from "@/lib/markets";
import { MarketCard } from "./MarketCard";
import { CategoryTabs } from "./CategoryTabs";
import { BoltIcon } from "./BoltIcon";

export const SORTS: { id: MarketSort; label: string }[] = [
  { id: "trending", label: "חם" },
  { id: "newest", label: "חדש" },
  { id: "closing", label: "נסגר בקרוב" },
  { id: "volume", label: "נפח" },
];

/**
 * Cards in the first server-rendered page.
 *
 * It was 36, which put 42 cards (with the featured/closing-soon strips) into the
 * home page's HTML: 427KB before compression, a 12,358px-tall document, and a
 * first paint that waits for all of it. Twelve fills the grid on every breakpoint
 * — four rows on a phone, six on a tablet, four on a desktop — and nobody reaches
 * card 13 without asking.
 */
export const PAGE = 12;

/** how many more each "הצגת עוד" adds — the first page is the one that has to be cheap */
export const PAGE_STEP = 24;

export type BrowseParams = { q?: string; sort?: string; status?: string; show?: string; person?: string };

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
  person,
}: {
  basePath: string;
  /** active category id, or "all" on the home page */
  category: string;
  params: BrowseParams;
  items: MarketView[];
  shown: number;
  total: number;
  counts?: Record<string, number>;
  /** the candidate the listing is filtered to, for the chip */
  person?: { id: string; name: string };
}) {
  const status = params.status === "resolved" ? "resolved" : "open";
  const sort = parseSort(params.sort);
  const q = params.q?.trim() || undefined;
  const link = (patch: BrowseParams) => browseHref(basePath, { ...params, ...patch });

  return (
    <section className="space-y-3">
      {/* the header search only appears from md up — on phones it lives here, above the board */}
      <form action={basePath} className="md:hidden">
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.status && <input type="hidden" name="status" value={params.status} />}
        <label className="relative block">
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            name="q"
            type="search"
            defaultValue={q ?? ""}
            enterKeyHint="search"
            placeholder="חיפוש שאלה: נתניהו, סקר, בנט…"
            className="tap w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-10 pl-3 outline-none placeholder:text-muted-2 focus:border-accent focus:bg-surface"
          />
        </label>
      </form>

      <CategoryTabs active={category} params={{ q, sort: params.sort, status: params.status, person: params.person }} counts={counts} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="scrollbar-none swipe-x -mx-3 flex items-center gap-1 px-3 text-sm sm:mx-0 sm:px-0">
          <Link
            href={link({ status: "open", show: undefined })}
            data-evt="status-tab"
            data-evt-label="פתוחים"
            className={`tap inline-flex shrink-0 items-center rounded-lg px-3 font-semibold ${status === "open" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
          >
            פתוחים
          </Link>
          <Link
            href={link({ status: "resolved", show: undefined })}
            data-evt="status-tab"
            data-evt-label="הוכרעו"
            className={`tap inline-flex shrink-0 items-center rounded-lg px-3 font-semibold ${status === "resolved" ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
          >
            הוכרעו
          </Link>
          {q && (
            <span className="tap ms-1 flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-muted">
              חיפוש: <strong className="text-text">{q}</strong>
              <Link href={link({ q: undefined })} className="ms-1 flex h-11 w-8 items-center justify-center text-muted-2 hover:text-no" aria-label="נקה חיפוש">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              </Link>
            </span>
          )}
          {person && (
            <span className="tap ms-1 flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-muted">
              מועמד: <strong className="text-text">{person.name}</strong>
              <Link href={link({ person: undefined })} className="ms-1 flex h-11 w-8 items-center justify-center text-muted-2 hover:text-no" aria-label="נקה סינון מועמד">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              </Link>
            </span>
          )}
        </div>
        <div className="scrollbar-none swipe-x -mx-3 flex items-center gap-1 px-3 text-[13px] sm:mx-0 sm:px-0 sm:text-xs">
          <Link
            href={category && category !== "all" ? `/rapid?category=${category}` : "/rapid"}
            data-evt="browser-rapid"
            className="tap pressable me-2 inline-flex shrink-0 items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 font-bold text-accent-2 hover:bg-accent/20"
          >
            <BoltIcon />
            ענו ברצף
          </Link>
          <span className="me-1 shrink-0 text-muted-2">מיון:</span>
          {SORTS.map((s) => (
            <Link
              key={s.id}
              href={link({ sort: s.id })}
              data-evt="sort-tab"
              data-evt-label={s.label}
              className={`tap inline-flex min-w-11 shrink-0 items-center justify-center rounded-md px-2.5 font-semibold ${sort === s.id ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
              rel="nofollow"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {items.map((m) => (
              <MarketCard key={m.id} m={m} />
            ))}
          </div>
          {/*
            The end of the list is where "I could not find the question I wanted"
            actually happens, so that is where the way to add one belongs. It was
            only in the profile menu, behind a login the visitor may not have.
          */}
          {total <= shown && (
            <p className="pt-2 text-center text-[13px] text-muted">
              לא מצאתם את השאלה שחיפשתם?{" "}
              <Link href="/suggest" data-evt="browser-suggest" className="font-semibold text-accent-2 hover:underline">
                הציעו אותה
              </Link>{" "}
              — צוות המערכת עובר על ההצעות ומפרסם את הטובות שבהן.
            </p>
          )}
          {total > shown && (
            <div className="flex flex-col items-center gap-1 pt-2">
              {/*
                No `rel="nofollow"` here, unlike the sort tabs above. The sort tabs
                reorder the same questions, so following them only re-crawls what the
                page already links to; ?show= is the only link on the board that
                reaches question 13 and onwards. `nofollow` never kept those URLs out
                of the index either — that is what the `robots: { index: false }`
                branch in the listing and category pages does — it only stopped the
                crawler from walking through to the questions themselves, which is
                how most of a 350-question board ended up depending on the sitemap
                alone for discovery.
              */}
              <Link
                href={link({ show: String(shown + PAGE_STEP) })}
                data-evt="show-more"
                className="tap pressable flex w-full items-center justify-center rounded-xl border border-border-2 bg-surface px-6 font-semibold text-text hover:bg-surface-2 sm:w-auto"
                scroll={false}
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
        <div className="card p-8 text-center text-muted sm:p-12">
          <p>
            לא נמצאו שאלות. נסו קטגוריה אחרת,{" "}
            <Link href="/" className="text-accent-2 hover:underline">
              נקו את הסינון
            </Link>
            , או עברו <Link href="/rapid" className="text-accent-2 hover:underline">למצב זריז</Link>.
          </p>
        </div>
      )}
    </section>
  );
}
