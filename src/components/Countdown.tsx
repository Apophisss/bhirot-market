import { ELECTION_DATE } from "@/lib/config";
import { daysUntil, fmtDate } from "@/lib/format";

function label(days: number) {
  return days > 0 ? `בעוד ${days} ימים` : days === 0 ? "היום" : "התקיימו";
}

/**
 * Days to election day. `hero` is the block on the dark banner, `card` the version
 * for a white surface, and `line` the same fact as one thin white line — what the
 * phone hero has room for once the pitch is cut back to a single CTA.
 */
export function Countdown({ variant = "hero" }: { variant?: "hero" | "card" | "line" }) {
  const days = daysUntil(`${ELECTION_DATE}T00:00:00+03:00`);
  if (variant === "line") {
    return (
      <div className="tabular text-[13px] text-white/70">
        הבחירות לכנסת ה־26 <strong className="font-extrabold text-white">{label(days)}</strong>
      </div>
    );
  }
  if (variant === "card") {
    return (
      <div className="min-w-0">
        <div className="text-[13px] leading-tight text-muted">הבחירות לכנסת ה־26</div>
        <div className="tabular text-sm font-extrabold leading-tight text-text-strong">
          {label(days)} <span className="font-medium text-muted">({fmtDate(ELECTION_DATE)})</span>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/25 bg-white/10 px-3.5 py-2.5 backdrop-blur sm:px-4 sm:py-3">
      <div className="text-xs text-white/70">הבחירות לכנסת ה־26</div>
      <div className="tabular text-base font-extrabold text-white sm:text-lg">
        {label(days)}
        <span className="ms-2 text-sm font-medium text-white/70">({fmtDate(ELECTION_DATE)})</span>
      </div>
    </div>
  );
}
