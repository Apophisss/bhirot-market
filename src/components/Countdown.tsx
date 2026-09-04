import { ELECTION_DATE } from "@/lib/config";
import { daysUntil, fmtDate } from "@/lib/format";

function label(days: number) {
  return days > 0 ? `בעוד ${days} ימים` : days === 0 ? "היום!" : "התקיימו";
}

/** Days to election day. `hero` sits on the dark banner, `card` on a white surface. */
export function Countdown({ variant = "hero" }: { variant?: "hero" | "card" }) {
  const days = daysUntil(`${ELECTION_DATE}T00:00:00+03:00`);
  if (variant === "card") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="text-xl" aria-hidden>🗓️</span>
        <div className="min-w-0">
          <div className="text-[11px] leading-tight text-muted">הבחירות לכנסת ה־26</div>
          <div className="tabular text-sm font-extrabold leading-tight text-text-strong">
            {label(days)} <span className="font-medium text-muted">({fmtDate(ELECTION_DATE)})</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-3.5 py-2.5 backdrop-blur sm:px-4 sm:py-3">
      <div className="text-2xl sm:text-3xl">🗓️</div>
      <div>
        <div className="text-xs text-white/70">הבחירות לכנסת ה־26</div>
        <div className="tabular text-base font-extrabold text-white sm:text-lg">
          {label(days)}
          <span className="ms-2 text-sm font-medium text-white/70">({fmtDate(ELECTION_DATE)})</span>
        </div>
      </div>
    </div>
  );
}
