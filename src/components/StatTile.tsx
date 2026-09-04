export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "yes" | "no" | "neutral" }) {
  const color = tone === "yes" ? "text-yes" : tone === "no" ? "text-no" : "text-text-strong";
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-2">{hint}</div>}
    </div>
  );
}
