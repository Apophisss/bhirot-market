import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";

export function CategoryTabs({
  active,
  params,
  counts = {},
}: {
  active: string;
  params: Record<string, string | undefined>;
  counts?: Record<string, number>;
}) {
  // every category has its own indexable landing page; "all" is the home page
  const mk = (id: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "category") sp.set(k, v);
    const base = id === "all" ? "/" : `/category/${id}`;
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const items = [{ id: "all", label: "הכל", emoji: "🔥" }, ...CATEGORIES];
  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {items.map((c) => {
        const isActive = active === c.id;
        const n = counts[c.id];
        if (c.id !== "all" && n === 0) return null;
        return (
          <Link
            key={c.id}
            href={mk(c.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              isActive ? "border-accent bg-accent/15 text-accent-2" : "border-border bg-surface text-muted hover:border-border-2 hover:text-text-strong"
            }`}
          >
            <span className="me-1">{c.emoji}</span>
            {c.label}
            {typeof n === "number" && <span className="tabular ms-1.5 text-xs text-muted-2">{n}</span>}
          </Link>
        );
      })}
    </div>
  );
}
