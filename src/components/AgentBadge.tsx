import Link from "next/link";
import { getLastAgentRun } from "@/lib/markets";
import { SITE_TEAM } from "@/lib/config";
import { timeAgo } from "@/lib/format";

export async function AgentBadge() {
  const last = await getLastAgentRun();
  return (
    <Link
      href="/about#updates"
      className="inline-flex items-start gap-2 rounded-2xl border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] leading-relaxed text-white/80 backdrop-blur transition hover:border-white/50 hover:bg-white/15 sm:items-center sm:rounded-full sm:text-xs"
      title={last?.summary}
    >
      <span className="live-dot mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-white sm:mt-0" />
      <span>
        השאלות מתעדכנות כל שעה על ידי <strong className="text-white">{SITE_TEAM}</strong>
        {last ? (
          <>
            {" "}· עדכון אחרון {timeAgo(last.createdAt)}
            {last.added ? ` · +${last.added} שאלות` : ""}
            {last.resolved ? ` · ${last.resolved} הוכרעו` : ""}
          </>
        ) : null}
      </span>
    </Link>
  );
}
