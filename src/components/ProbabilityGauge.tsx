import { pct } from "@/lib/format";

/** Half-circle gauge showing how sure the players are of "yes". */
export function ProbabilityGauge({ p, size = 64, label = "סיכוי" }: { p: number; size?: number; label?: string }) {
  const r = size / 2 - 5;
  const cx = size / 2;
  const cy = size / 2 + 2;
  const circ = Math.PI * r; // half circle length
  const fill = Math.max(0.02, Math.min(1, p)) * circ;
  const color = p >= 0.5 ? "var(--color-yes)" : "var(--color-no)";
  return (
    <div className="flex shrink-0 flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size / 2 + 6} viewBox={`0 0 ${size} ${size / 2 + 6}`} aria-hidden>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--color-surface-3)"
          strokeWidth={6}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
        />
      </svg>
      <div className="tabular -mt-3 text-lg font-extrabold leading-none text-text-strong">{pct(p)}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}
