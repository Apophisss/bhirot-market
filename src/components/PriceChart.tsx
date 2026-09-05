"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pct } from "@/lib/format";

/** `synthetic` points are a display-only estimate — see src/lib/synthetic-history.ts. */
type Point = { t: number; p: number; synthetic?: boolean };
type Range = "1D" | "1W" | "1M" | "ALL";

const RANGES: { id: Range; label: string; ms: number }[] = [
  { id: "1D", label: "יום", ms: 86_400_000 },
  { id: "1W", label: "שבוע", ms: 7 * 86_400_000 },
  { id: "1M", label: "חודש", ms: 30 * 86_400_000 },
  { id: "ALL", label: "הכל", ms: Infinity },
];

// Israel time on both sides of the render: the server runs in UTC, so without an
// explicit zone an evening tick SSRs one day and hydrates as another.
const TZ = "Asia/Jerusalem";
const fmtTip = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtAxisDay = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "short" });
const fmtAxisTime = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtAxisBoth = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit" });

export function PriceChart({
  points,
  current,
  isOpen,
  estimateBand,
  tradeCount,
  now: nowProp,
}: {
  points: Point[];
  current: number;
  isOpen: boolean;
  /** how far the estimate may stray from the recorded price, in probability units */
  estimateBand?: number;
  /** real trades executed on this market — the estimate must never be mistaken for these */
  tradeCount?: number;
  /** the rendering server's clock — passed in so the server and the client agree */
  now?: number;
}) {
  const [range, setRange] = useState<Range>("ALL");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Never read the clock here: this component is server-rendered and then hydrated,
  // and a second reading would put a different curve on each side.
  const now = nowProp ?? (points.length ? points[points.length - 1].t : 0);
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

  // a 280px-tall chart eats a whole phone screen — scale it with the width
  const H = W < 420 ? 190 : W < 768 ? 230 : 280;
  const PAD = { top: 16, right: W < 420 ? 34 : 44, bottom: 26, left: 8 };

  const data = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.t - b.t);
    const last = sorted.length ? sorted[sorted.length - 1] : { t: now, p: current, synthetic: false };
    // the appended "now" point is the real current price, never an estimate
    const withNow: Point[] = isOpen && now > last.t ? [...sorted, { t: now, p: current }] : sorted;
    const r = RANGES.find((x) => x.id === range)!;
    if (!Number.isFinite(r.ms)) return withNow.length ? withNow : [{ t: now, p: current }];
    const start = now - r.ms;
    const inRange = withNow.filter((pt) => pt.t >= start);
    const before = withNow.filter((pt) => pt.t < start);
    // the carried-over left edge keeps its provenance: otherwise the most visible
    // pixel of a 1W view would be an estimate drawn as solid, real data
    const carry = before.length ? before[before.length - 1] : (inRange[0] ?? last);
    return [{ t: start, p: carry.p, synthetic: carry.synthetic }, ...inRange];
  }, [points, current, isOpen, range, now]);

  const t0 = data[0].t;
  const t1 = Math.max(data[data.length - 1].t, t0 + 1);
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const nTicks = W < 480 ? 2 : 4;
  const y = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);

  const toPath = (pts: Point[]) => pts.map((pt, i) => `${i ? "L" : "M"}${x(pt.t).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" ");

  /** Consecutive stretches of the same provenance. Neighbouring runs share their
   *  boundary point, so the estimate hands over to the real line with no gap. */
  const runs = useMemo(() => {
    const out: { synthetic: boolean; pts: Point[] }[] = [];
    for (let i = 1; i < data.length; i++) {
      const synthetic = Boolean(data[i - 1].synthetic || data[i].synthetic);
      const open = out[out.length - 1];
      if (open && open.synthetic === synthetic) open.pts.push(data[i]);
      else out.push({ synthetic, pts: [data[i - 1], data[i]] });
    }
    if (!out.length) out.push({ synthetic: Boolean(data[0].synthetic), pts: [data[0]] });
    return out;
  }, [data]);

  const lastPt = data[data.length - 1];
  const hoverPt = hover != null ? data[hover] : null;

  // Never a fabricated headline number: the change is measured across real trading only.
  const realPts = data.filter((d) => !d.synthetic);
  const traded = tradeCount == null ? realPts.length > 1 : tradeCount > 0;
  const change = traded && realPts.length > 1 ? realPts[realPts.length - 1].p - realPts[0].p : null;
  const hasEstimate = data.some((d) => d.synthetic);

  // where the estimate ends and real trading begins
  const openIdx = data.findIndex((d) => !d.synthetic);
  const openAt = openIdx > 0 ? data[openIdx].t : null;
  const estX0 = hasEstimate ? x(data[0].t) : 0;
  const estX1 = hasEstimate ? x(openAt ?? data[data.length - 1].t) : 0;
  // a market that opened minutes ago puts the boundary at the very edge — flip the
  // label inwards instead of letting it clip
  const openNearEdge = openAt !== null && x(openAt) > W - PAD.right - 80;
  const bandLabel = estimateBand ? `עד ${(estimateBand * 100).toFixed(1)} נק׳` : null;

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
    <div className="card p-3.5 sm:p-4">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs text-muted">סיכוי ל״כן״</div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`tabular text-2xl font-extrabold sm:text-3xl ${hoverPt?.synthetic ? "text-muted" : "text-text-strong"}`}>
              {hoverPt?.synthetic ? "≈" : ""}
              {pct(hoverPt ? hoverPt.p : current, 1)}
            </span>
            {!hoverPt && change !== null && Math.abs(change) >= 0.0005 && (
              <span className={`tabular text-sm font-semibold ${change >= 0 ? "text-yes" : "text-no"}`}>
                {`${change >= 0 ? "+" : "-"}${Math.abs(change * 100).toFixed(1)} נק׳`}
              </span>
            )}
            {!hoverPt && !traded && (
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted-2">טרם נענתה</span>
            )}
            {hoverPt && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                {/* a fabricated point must never read as "5 בספט 14:30 — 61%" */}
                {hoverPt.synthetic ? fmtAxisDay.format(hoverPt.t) : fmtTip.format(hoverPt.t)}
                {hoverPt.synthetic && <span className="rounded bg-surface-2 px-1 py-0.5 text-[10px] text-muted-2">אומדן</span>}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="טווח זמן">
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={`tap pressable min-w-11 rounded-md px-3 text-xs font-semibold transition ${range === r.id ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-text"}`}
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
        onPointerDown={onMove}
        onPointerMove={(e) => {
          // on touch, only scrub while the finger is down; a mouse scrubs on hover
          if (e.pointerType === "mouse" || e.buttons > 0 || e.pressure > 0) onMove(e);
        }}
        onPointerUp={() => setHover(null)}
        onPointerCancel={() => setHover(null)}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={
          hasEstimate
            ? "מהלך מד הניחושים לאורך זמן. הקטע המקווקו הוא אומדן להמחשה ולא תשובות אמיתיות."
            : "גרף הסתברות לאורך זמן"
        }
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
          {/* the estimate is hatched, so a cropped screenshot still shows it is not real trading */}
          <pattern id="chart-estimate" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--color-muted-2)" opacity="0.05" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-muted-2)" strokeWidth="1" opacity="0.22" />
          </pattern>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={W - PAD.right + 6} y={y(g) + 4} fontSize={11} fill="var(--color-muted-2)" className="tabular">
              {Math.round(g * 100)}%
            </text>
          </g>
        ))}
        {ticks.map((t, i) => (
          <text key={i} x={x(t)} y={H - 7} fontSize={11} fill="var(--color-muted-2)" textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>
            {fmtAxis.format(t)}
          </text>
        ))}
        {runs.map((r, i) => (
          <path
            key={`area-${i}`}
            d={`${toPath(r.pts)} L${x(r.pts[r.pts.length - 1].t).toFixed(1)},${y(0)} L${x(r.pts[0].t).toFixed(1)},${y(0)} Z`}
            fill={r.synthetic ? "url(#chart-estimate)" : "url(#chart-fill)"}
          />
        ))}
        {runs.map((r, i) => (
          <path
            key={`line-${i}`}
            d={toPath(r.pts)}
            fill="none"
            stroke={r.synthetic ? "var(--color-muted-2)" : "var(--color-accent)"}
            strokeWidth={r.synthetic ? 1.75 : 2}
            strokeDasharray={r.synthetic ? "5 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hasEstimate && estX1 - estX0 > 90 && (
          <text x={(estX0 + estX1) / 2} y={PAD.top + 14} fontSize={11} fill="var(--color-muted-2)" opacity={0.75} textAnchor="middle">
            אומדן{bandLabel ? ` · ${bandLabel}` : ""}
          </text>
        )}
        {openAt !== null && (
          <g>
            <line x1={x(openAt)} x2={x(openAt)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 3" />
            <text
              x={x(openAt) + (openNearEdge ? -6 : 6)}
              y={H - PAD.bottom - 6}
              fontSize={10}
              fill="var(--color-muted-2)"
              textAnchor={openNearEdge ? "end" : "start"}
            >
              פתיחת השאלה
            </text>
          </g>
        )}
        {/* end marker with surface ring */}
        <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r={6} fill="var(--color-surface)" />
        <circle cx={x(lastPt.t)} cy={y(lastPt.p)} r={4} fill="var(--color-accent)" />
        {hoverPt && (
          <g>
            <line x1={x(hoverPt.t)} x2={x(hoverPt.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-muted-2)" strokeWidth={1} />
            <circle cx={x(hoverPt.t)} cy={y(hoverPt.p)} r={7} fill="var(--color-surface)" />
            <circle cx={x(hoverPt.t)} cy={y(hoverPt.p)} r={5} fill={hoverPt.synthetic ? "var(--color-muted-2)" : "var(--color-accent-2)"} />
          </g>
        )}
      </svg>
      {traded && (
        <p className="mt-1 text-center text-[11px] text-muted-2 lg:hidden">החליקו על הגרף כדי לראות מחיר בזמן מסוים</p>
      )}
      {!traded && (
        <p className="mt-2 text-center text-xs text-muted-2">
          {hasEstimate
            ? `עדיין אין תשובות — הקו המקווקו הוא אומדן להמחשה בלבד${bandLabel ? ` (סטייה של ${bandLabel} מהמחיר הרשום)` : ""}, לא תשובות אמיתיות`
            : "עדיין אין תשובות — הגרף יתעדכן עם התשובה הראשונה"}
        </p>
      )}
    </div>
  );
}
