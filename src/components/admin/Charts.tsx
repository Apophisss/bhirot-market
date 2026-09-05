import type { ReactNode } from "react";

/**
 * The dashboard's chart primitives. Deliberately tiny and dependency-free:
 * every chart here is one series in one hue, so nothing needs a legend and
 * nothing can be misread as a category. Hover text lives in `title`, and every
 * chart sits next to the same numbers in a list, so colour is never the only channel.
 */

const nf = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
export const fmt = (v: number) => nf.format(v ?? 0);

export function Card({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-bold text-text-strong">{title}</h2>
          {hint && <p className="text-xs text-muted-2">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  delta,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  /** change vs. the previous, equally long period (0.12 = +12%) */
  delta?: number | null;
  tone?: "yes" | "no" | "neutral";
}) {
  const color = tone === "yes" ? "text-yes" : tone === "no" ? "text-no" : "text-text-strong";
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</div>
      <div className="mt-0.5 flex items-center gap-2 text-xs">
        {delta != null && Number.isFinite(delta) && (
          <span className={delta >= 0 ? "text-yes" : "text-no"}>
            {delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(delta) * 100)}%
          </span>
        )}
        {hint && <span className="text-muted-2">{hint}</span>}
      </div>
    </div>
  );
}

export interface Point {
  label: string;
  value: number;
  /** extra text for the hover tooltip */
  hint?: string;
}

/**
 * Daily (or hourly) magnitude. One hue, bars anchored to the baseline, time reads
 * left→right even in an RTL page — hence dir="ltr" on the plot itself.
 */
export function BarSeries({ data, height = 120, unit = "" }: { data: Point[]; height?: number; unit?: string }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div dir="ltr" className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className="group relative flex-1 rounded-t-[4px] bg-accent/85 transition hover:bg-accent"
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, minWidth: 2 }}
            title={`${d.label}: ${fmt(d.value)}${unit}${d.hint ? ` · ${d.hint}` : ""}`}
          />
        ))}
      </div>
      <div dir="ltr" className="mt-1 flex justify-between text-[13px] text-muted-2">
        <span>{data[0]?.label}</span>
        <span className="tabular">
          שיא {fmt(max)}
          {unit}
        </span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Funnel stages: bar width is the share of the first stage; the drop-off is spelled out. */
export function Funnel({ stages }: { stages: { label: string; count: number; rate: number }[] }) {
  const top = stages[0]?.count || 1;
  if (!stages.length) return <Empty />;
  return (
    <ol className="space-y-2">
      {stages.map((s, i) => (
        <li key={s.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-medium text-text">{s.label}</span>
            <span className="tabular text-muted">
              {fmt(s.count)}
              {i > 0 && <span className={`ms-2 ${s.rate < 0.2 ? "text-no" : "text-muted-2"}`}>{fmt(s.rate * 100)}% מהשלב הקודם</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, (s.count / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Top-N list with an in-row magnitude bar. The number is always written out. */
export function TopList({
  rows,
  unit = "",
  empty = "אין נתונים בטווח הזה",
}: {
  rows: { key: string; value: number; hint?: string; href?: string }[];
  unit?: string;
  empty?: string;
}) {
  if (!rows.length) return <Empty text={empty} />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="relative overflow-hidden rounded-lg px-2 py-1.5">
          <span className="absolute inset-y-0 end-0 rounded-lg bg-accent/10" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
          <span className="relative flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-text" title={r.key}>
              {r.href ? (
                <a href={r.href} className="hover:text-accent-2 hover:underline">
                  {r.key}
                </a>
              ) : (
                r.key
              )}
            </span>
            <span className="tabular shrink-0 font-semibold text-text-strong">
              {fmt(r.value)}
              {unit}
            </span>
            {r.hint && <span className="tabular shrink-0 text-xs text-muted-2">{r.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ text = "אין נתונים בטווח הזה" }: { text?: string }) {
  return <p className="py-6 text-center text-sm text-muted-2">{text}</p>;
}

/** "2026-09-04" -> "4.9" */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return d && m ? `${Number(d)}.${Number(m)}` : day;
}

export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}
