"use client";

import { useMemo } from "react";
import { pct } from "@/lib/format";
import { rapidSparkPoints, type RapidSpark as Spark, type RapidSparkPoint } from "@/lib/rapid";

/**
 * The question's past, on a rapid card.
 *
 * A small sibling of `PriceChart`, with the same two promises:
 *  · the scale is fixed at 0–100%, never auto-fitted. The fabricated part of a
 *    series is bounded to ±3 points (src/lib/synthetic-history.ts) — auto-fitting
 *    would blow that noise up into a dramatic-looking swing, which is exactly the
 *    lie the bound exists to prevent.
 *  · an estimated stretch is drawn dashed and labelled, so a glance at the card can
 *    never mistake it for real trading.
 *
 * The SVG is stretched to whatever box the card can spare (`preserveAspectRatio="none"`),
 * so every stroke carries `vector-effect="non-scaling-stroke"`, the end marker is an HTML
 * element (a circle would stretch into an ellipse), and every label lives in HTML around
 * the SVG — where it stays right-to-left like the rest of the card.
 */

const TZ = "Asia/Jerusalem";
const fmtDay = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "short" });

export function RapidSpark({ spark, tradeCount }: { spark: Spark; tradeCount: number }) {
  const pts = useMemo(() => rapidSparkPoints(spark), [spark]);

  const geom = useMemo(() => {
    const t0 = pts[0].t;
    const t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
    const x = (t: number) => ((t - t0) / (t1 - t0)) * 100;
    const y = (p: number) => (1 - p) * 100;
    const path = (run: RapidSparkPoint[]) =>
      run.map((q, i) => `${i ? "L" : "M"}${x(q.t).toFixed(1)},${y(q.p).toFixed(1)}`).join(" ");

    // consecutive stretches of the same provenance, sharing their boundary point so
    // the estimate hands over to the real line with no gap — as in PriceChart
    const runs: { synthetic: boolean; pts: RapidSparkPoint[] }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const synthetic = pts[i - 1].synthetic || pts[i].synthetic;
      const open = runs[runs.length - 1];
      if (open && open.synthetic === synthetic) open.pts.push(pts[i]);
      else runs.push({ synthetic, pts: [pts[i - 1], pts[i]] });
    }
    return { x, y, path, runs };
  }, [pts]);

  const last = pts[pts.length - 1];
  const hasEstimate = pts.some((q) => q.synthetic);
  // Never a fabricated headline number: the move is measured across real trading only.
  const real = pts.filter((q) => !q.synthetic);
  const change = tradeCount > 0 && real.length > 1 ? real[real.length - 1].p - real[0].p : null;

  return (
    // The floor lives on the figure, not on the plot inside it: a `min-h-0` figure
    // shrinks to nothing under a long question while its plot keeps its own height,
    // and a stretched SVG then paints straight over the price bar and the answer
    // buttons. With the floor here the card body scrolls instead, which is the deal.
    <figure className="flex min-h-[72px] flex-1 flex-col gap-1 short:min-h-[62px]">
      {/* the padding is the room the end marker needs: it sits on the very last point,
          which is the top, the bottom or the right edge of the plot itself */}
      <div className="min-h-0 flex-1 py-1 pr-1.5">
        <div className="relative h-full w-full">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="block h-full w-full"
            role="img"
            aria-label={
              hasEstimate
                ? `מהלך הסיכוי לאורך זמן, כרגע ${pct(last.p)}. הקטע המקווקו הוא אומדן להמחשה, לא מסחר אמיתי.`
                : `מהלך הסיכוי לאורך זמן, כרגע ${pct(last.p)}`
            }
          >
            {[25, 50, 75].map((g) => (
              <line
                key={g}
                x1={0}
                x2={100}
                y1={g}
                y2={g}
                stroke="var(--color-border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                opacity={g === 50 ? 1 : 0.6}
              />
            ))}
            {geom.runs.map((r, i) => (
              <path
                key={`area-${i}`}
                d={`${geom.path(r.pts)} L${geom.x(r.pts[r.pts.length - 1].t).toFixed(1)},100 L${geom.x(r.pts[0].t).toFixed(1)},100 Z`}
                fill={r.synthetic ? "var(--color-muted-2)" : "var(--color-accent)"}
                opacity={r.synthetic ? 0.07 : 0.16}
              />
            ))}
            {geom.runs.map((r, i) => (
              <path
                key={`line-${i}`}
                d={geom.path(r.pts)}
                fill="none"
                stroke={r.synthetic ? "var(--color-muted-2)" : "var(--color-accent)"}
                strokeWidth={r.synthetic ? 1.5 : 2}
                strokeDasharray={r.synthetic ? "4 3" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {/* the end marker is HTML: a circle inside a stretched SVG would draw as an ellipse */}
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent"
            style={{ left: `${geom.x(last.t)}%`, top: `${geom.y(last.p)}%` }}
            aria-hidden
          />
        </div>
      </div>
      <figcaption className="flex items-center justify-between gap-2 text-[10px] leading-none text-muted-2">
        <span className="truncate">מאז {fmtDay.format(pts[0].t)}</span>
        {hasEstimate ? (
          <span className="shrink-0 rounded bg-surface-2 px-1 py-0.5 font-semibold">
            מקווקו = אומדן{spark.band ? ` · עד ${(spark.band * 100).toFixed(1)} נק׳` : ""}
          </span>
        ) : change !== null && Math.abs(change) >= 0.005 ? (
          <span className={`tabular shrink-0 font-bold ${change >= 0 ? "text-yes" : "text-no"}`}>
            {`${change >= 0 ? "+" : "-"}${Math.abs(change * 100).toFixed(1)} נק׳`}
          </span>
        ) : (
          <span className="shrink-0">{tradeCount > 0 ? "מהלך המחיר" : "טרם נסחר"}</span>
        )}
      </figcaption>
    </figure>
  );
}
