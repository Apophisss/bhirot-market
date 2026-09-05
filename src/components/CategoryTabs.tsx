import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";

export function CategoryTabs({
  active,
  params,
  counts = {},
  basePath = "/",
  className = "",
}: {
  active: string;
  params: Record<string, string | undefined>;
  counts?: Record<string, number>;
  basePath?: string;
  className?: string;
}) {
  const mk = (id: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "category") sp.set(k, v);
    // on the listing every category has its own indexable landing page ("all" is the
    // home page); on another path (e.g. /rapid) the category stays a query param
    let base = basePath;
    if (basePath === "/") base = id === "all" ? "/" : `/category/${id}`;
    else if (id !== "all") sp.set("category", id);
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const items = [{ id: "all", label: "כל השווקים", accent: "#1d4ed8" }, ...CATEGORIES];
  return (
    // full-bleed on phones so the strip reads as a swipeable carousel
    <div className={`scrollbar-none swipe-x -mx-3 flex gap-2 px-3 pb-1 sm:mx-0 sm:px-0 ${className}`}>
      {items.map((c) => {
        const isActive = active === c.id;
        const n = counts[c.id];
        if (c.id !== "all" && n === 0) return null;
        return (
          <Link
            key={c.id}
            href={mk(c.id)}
            data-evt="category-tab"
            data-evt-label={c.label}
            aria-current={isActive ? "page" : undefined}
            className={`pressable flex shrink-0 items-center rounded-full border px-3.5 py-2 text-sm font-medium transition ${
              isActive ? "border-accent bg-accent/15 text-accent-2" : "border-border bg-surface text-muted hover:border-border-2 hover:text-text-strong"
            }`}
          >
            <span
              className="me-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ background: c.accent }}
              aria-hidden
            />
            {c.label}
            {typeof n === "number" && <span className="tabular ms-1.5 text-xs text-muted-2">{n}</span>}
          </Link>
        );
      })}
    </div>
  );
}
