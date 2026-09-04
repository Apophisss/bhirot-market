import Link from "next/link";
import { getLastAgentRun } from "@/lib/markets";
import { timeAgo } from "@/lib/format";

export async function AgentBadge() {
  const last = await getLastAgentRun();
  return (
    <Link
      href="/about#claude"
      className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur transition hover:border-white/50 hover:bg-white/15"
      title={last?.summary}
    >
      <span className="live-dot inline-block h-2 w-2 rounded-full bg-white" />
      <span>
        השאלות מתעדכנות כל שעה על ידי <strong className="text-white">Claude</strong>
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
