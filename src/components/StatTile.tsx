export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "yes" | "no" | "neutral" }) {
  const color = tone === "yes" ? "text-yes" : tone === "no" ? "text-no" : "text-text-strong";
  return (
    <div className="card p-3 sm:p-4">
      <div className="text-[11px] text-muted sm:text-xs">{label}</div>
      <div className={`tabular mt-1 text-xl font-extrabold sm:text-2xl ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-2 sm:text-xs">{hint}</div>}
    </div>
  );
}
