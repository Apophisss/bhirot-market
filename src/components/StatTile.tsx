/**
 * One headline number on the portfolio / invite pages.
 *
 * `size="hero"` is for the single number a page is *about* — on the portfolio
 * that is the P&L, which is the only tile whose value changes when something
 * happens. Everything else stays at the ordinary size so the hierarchy says which
 * number to read first.
 */
export function StatTile({
  label,
  value,
  hint,
  tone,
  badge,
  size = "normal",
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  /** either the legacy shorthand or a Tailwind text colour (see `pnlTone`) */
  tone?: "yes" | "no" | "neutral" | string;
  /** a second, smaller figure beside the value — the percentage next to the shekels */
  badge?: string;
  size?: "normal" | "hero";
  className?: string;
}) {
  const color =
    tone === "yes" ? "text-yes" : tone === "no" ? "text-no" : tone && tone !== "neutral" ? tone : "text-text-strong";
  const hero = size === "hero";
  return (
    <div className={`card ${hero ? "p-4 sm:p-5" : "p-3 sm:p-4"} ${className}`}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`tabular font-extrabold ${hero ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl"} ${color}`}>{value}</span>
        {badge && <span className={`tabular text-sm font-bold sm:text-base ${color}`}>{badge}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[13px] text-muted-2">{hint}</div>}
    </div>
  );
}
