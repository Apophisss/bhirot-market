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
    if (id !== "all") sp.set("category", id);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const items = [{ id: "all", label: "כל השווקים", accent: "#1d4ed8" }, ...CATEGORIES];
  return (
    <div className={`scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 ${className}`}>
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
