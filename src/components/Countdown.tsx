import { ELECTION_DATE } from "@/lib/config";
import { daysUntil, fmtDate } from "@/lib/format";

export function Countdown() {
  const days = daysUntil(`${ELECTION_DATE}T00:00:00+03:00`);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface/70 px-4 py-3 backdrop-blur">
      <div className="text-3xl">🗓️</div>
      <div>
        <div className="text-xs text-muted">הבחירות לכנסת ה־26</div>
        <div className="tabular text-lg font-extrabold text-text-strong">
          {days > 0 ? `בעוד ${days} ימים` : days === 0 ? "היום!" : "התקיימו"}
          <span className="ms-2 text-sm font-medium text-muted">({fmtDate(ELECTION_DATE)})</span>
        </div>
      </div>
    </div>
  );
}
