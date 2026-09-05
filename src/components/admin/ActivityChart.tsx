import type { DayPoint } from "@/lib/admin-stats";
import { money } from "@/lib/format";

// Israel time on both sides of the render, like every other date on the site.
const fmtDay = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });

/**
 * Daily volume for the last two weeks, with the trade and sign-up counts in the
 * bar's tooltip. Server-rendered inline SVG: no chart library, no client bundle,
 * and it paints with the rest of the dashboard.
 */
export function ActivityChart({ daily }: { daily: DayPoint[] }) {
  const W = 720;
  const H = 160;
  const PAD = { top: 12, right: 8, bottom: 22, left: 8 };
  const max = Math.max(1, ...daily.map((d) => d.volume));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, daily.length);
  const barW = Math.max(6, slot * 0.62);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="מחזור יומי בשבועיים האחרונים">
        <line x1={PAD.left} y1={PAD.top + innerH} x2={W - PAD.right} y2={PAD.top + innerH} stroke="var(--color-border)" />
        {daily.map((d, i) => {
          const h = (d.volume / max) * innerH;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const y = PAD.top + innerH - h;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${money(d.volume)} · ${d.trades} עסקאות · ${d.newUsers} נרשמים`}</title>
              <rect x={x} y={y} width={barW} height={Math.max(h, d.volume > 0 ? 2 : 0)} rx={3} fill="var(--color-accent)" opacity={0.85} />
              {d.newUsers > 0 && <circle cx={x + barW / 2} cy={PAD.top + innerH - h - 6} r={3} fill="var(--color-yes)" />}
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-muted-2)"
                // every other label on a narrow viewport would collide
                className={i % 2 && daily.length > 10 ? "hidden sm:inline" : undefined}
              >
                {fmtDay.format(new Date(`${d.day}T12:00:00Z`))}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" /> מחזור יומי (שיא: {money(max)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-yes" /> יום שבו נרשמו משתמשים חדשים
        </span>
      </div>
    </div>
  );
}
