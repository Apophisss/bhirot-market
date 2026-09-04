import Link from "next/link";
import { getLastAgentRun } from "@/lib/markets";
import { SITE_TEAM } from "@/lib/config";
import { timeAgo } from "@/lib/format";

export async function AgentBadge() {
  const last = await getLastAgentRun();
  return (
    <Link
      href="/about#updates"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs text-muted hover:border-border-2"
      title={last?.summary}
    >
      <span className="live-dot inline-block h-2 w-2 rounded-full bg-yes" />
      <span>
        השאלות מתעדכנות כל שעה על ידי <strong className="text-text">{SITE_TEAM}</strong>
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
