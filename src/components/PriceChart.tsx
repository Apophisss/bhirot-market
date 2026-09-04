"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pct } from "@/lib/format";

type Point = { t: number; p: number };
type Range = "1D" | "1W" | "1M" | "ALL";

const RANGES: { id: Range; label: string; ms: number }[] = [
  { id: "1D", label: "יום", ms: 86_400_000 },
  { id: "1W", label: "שבוע", ms: 7 * 86_400_000 },
  { id: "1M", label: "חודש", ms: 30 * 86_400_000 },
  { id: "ALL", label: "הכל", ms: Infinity },
];

const H = 280;
const PAD = { top: 16, right: 44, bottom: 28, left: 8 };

const fmtTip = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtAxisDay = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });
const fmtAxisTime = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" });
const fmtAxisBoth = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", hour: "2-digit" });

export function PriceChart({ points, current, isOpen }: { points: Point[]; current: number; isOpen: boolean }) {
  const [range, setRange] = useState<Range>("ALL");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [now] = useState(() => Date.now());
  // Render at the container's real pixel width so axis text stays legible on phones.
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.t - b.t);
    const last = sorted.length ? sorted[sorted.length - 1] : { t: now, p: current };
    const withNow: Point[] = isOpen ? [...sorted, { t: now, p: current }] : sorted;
    const r = RANGES.find((x) => x.id === range)!;
    if (!Number.isFinite(r.ms)) return withNow.length ? withNow : [{ t: now, p: current }];
    const start = now - r.ms;
    const inRange = withNow.filter((pt) => pt.t >= start);
    const before = withNow.filter((pt) => pt.t < start);
    const carry = before.length ? before[before.length - 1].p : inRange.length ? inRange[0].p : last.p;
    return [{ t: start, p: carry }, ...inRange];
  }, [points, current, isOpen, range, now]);

  const t0 = data[0].t;
  const t1 = Math.max(data[data.length - 1].t, t0 + 1);
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const nTicks = W < 480 ? 2 : 4;
  const y = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);

  const path = data.map((pt, i) => `${i ? "L" : "M"}${x(pt.t).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" ");
  const area = `${path} L${x(t1).toFixed(1)},${y(0)} L${x(t0).toFixed(1)},${y(0)} Z`;
  const lastPt = data[data.length - 1];
  const hoverPt = hover != null ? data[hover] : null;

  const change = data.length > 1 ? lastPt.p - data[0].p : 0;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    data.forEach((pt, i) => {
      const d = Math.abs(x(pt.t) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  const ticks = useMemo(() => {
    return Array.from({ length: nTicks + 1 }, (_, i) => t0 + ((t1 - t0) * i) / nTicks);
  }, [t0, t1, nTicks]);

  // short ranges get clock labels, long ranges get dates
  const span = t1 - t0;
  const fmtAxis = span < 36 * 3600_000 ? fmtAxisTime : span < 10 * 86_400_000 ? fmtAxisBoth : fmtAxisDay;

  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs text-muted">סיכוי ל״כן״</div>
          <div className="flex items-baseline gap-2">
            <span className="tabular text-3xl font-extrabold text-text-strong">{pct(hoverPt ? hoverPt.p : current, 1)}</span>
            {!hoverPt && data.length > 1 && (
              <span className={`tabular text-sm font-semibold ${change >= 0 ? "text-yes" : "text-no"}`}>
                {`${change >= 0 ? "+" : "-"}${Math.abs(change * 100).toFixed(1)} נק׳`}
              </span>
            )}
            {hoverPt && <span className="text-xs text-muted">{fmtTip.format(hoverPt.t)}</span>}
          </div>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="טווח זמן">
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${range === r.id ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-text"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-none select-none"
        style={{ direction: "ltr", height: H }}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="גרף הסתברות לאורך זמן"
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={W - PAD.right + 8} y={y(g) + 4} fontSize={11} fill="var(--color-muted-2)" className="tabular">
              {Math.round(g * 100)}%
            </text>
          </g>
        ))}
        {ticks.map((t, i) => (
          <text key={i} x={x(t)} y={H - 8} fontSize={11} fill="var(--color-muted-2)" textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>
            {fmtAxis.format(t)}
          </text>
        ))}
        <path d={area} fill="url(#chart-fill)" />
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* end marker with surface ring */}
        <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r={6} fill="var(--color-surface)" />
        <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r={4} fill="var(--color-accent)" />
        {hoverPt && (
          <g>
            <line x1={x(hoverPt.t)} x2={x(hoverPt.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-muted-2)" strokeWidth={1} />
            <circle cx={x(hoverPt.t)} cy={y(hoverPt.p)} r={7} fill="var(--color-surface)" />
            <circle cx={x(hoverPt.t)} cy={y(hoverPt.p)} r={5} fill="var(--color-accent-2)" />
          </g>
        )}
      </svg>
      {points.length <= 1 && <p className="mt-2 text-center text-xs text-muted-2">עדיין אין עסקאות — הגרף יתעדכן עם המסחר הראשון</p>}
    </div>
  );
}
