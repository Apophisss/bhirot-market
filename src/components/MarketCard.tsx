import Link from "next/link";
import type { MarketView } from "@/lib/markets";
import { money, pct, closesLabel } from "@/lib/format";
import { ProbabilityGauge } from "./ProbabilityGauge";
import { getCategory } from "@/lib/categories";
import { MarketImage } from "./MarketImage";

export function MarketCard({ m }: { m: MarketView }) {
  const href = `/market/${m.id}`;
  const cat = getCategory(m.category);
  const resolved = m.status !== "open";
  return (
    <article className="card card-hover flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Link href={href} className="shrink-0">
          <MarketImage src={m.image} fallback={cat.cover} alt={m.personName ?? ""} className="h-12 w-12 rounded-xl border border-border object-cover" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
            <span className="rounded-md px-1.5 py-0.5" style={{ background: `${cat.accent}22`, color: cat.accent }}>
              {cat.emoji} {cat.label}
            </span>
            {m.createdBy.startsWith("claude") && <span title="נוצר אוטומטית על ידי Claude">🤖</span>}
          </div>
          <Link href={href} className="line-clamp-3 text-[15px] font-semibold leading-snug text-text-strong hover:text-accent-2">
            {m.title}
          </Link>
        </div>
        <ProbabilityGauge p={m.probability} />
      </div>

      {resolved ? (
        <div
          className={`rounded-lg px-3 py-2 text-center text-sm font-bold ${
            m.status === "cancelled" ? "bg-surface-2 text-muted" : m.resolution === "YES" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
          }`}
        >
          {m.status === "cancelled" ? "בוטל" : m.resolution === "YES" ? "הוכרע: כן ✓" : "הוכרע: לא ✗"}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`${href}?side=yes`}
            className="rounded-lg bg-yes/15 py-2 text-center text-sm font-bold text-yes transition hover:bg-yes hover:text-white"
          >
            כן {pct(m.probability)}
          </Link>
          <Link
            href={`${href}?side=no`}
            className="rounded-lg bg-no/15 py-2 text-center text-sm font-bold text-no transition hover:bg-no hover:text-white"
          >
            לא {pct(1 - m.probability)}
          </Link>
        </div>
      )}

      <footer className="mt-auto flex items-center justify-between text-xs text-muted">
        <span className="tabular">{money(m.volume, { compact: true })} נפח · {m.tradeCount} עסקאות</span>
        <span>{resolved ? "" : closesLabel(m.closesAt)}</span>
      </footer>
    </article>
  );
}
