import Link from "next/link";
import { getLastAgentRun } from "@/lib/markets";
import { SITE_TEAM } from "@/lib/config";
import { timeAgo } from "@/lib/format";
import { displayUpdatedAt } from "@/lib/display-stats";

/**
 * The "last updated" chip on top of the hero.
 *
 * The counts it carries belong to ONE editorial run, while the row of headline
 * numbers a few hundred pixels below it counts the whole board. Both used to say
 * "N הוכרעו" with no other words, so a run that resolved one question sat on the
 * same screen as a board total of 0 — two different numbers for what read as the
 * same fact.
 *
 * Two things fix that, and both matter: the run's figures now say out loud that
 * they are about the last update, and the resolution count is dropped entirely
 * when the board has nothing resolved to show for it — a claimed resolution the
 * visitor cannot go and look at is worse than no claim at all.
 */
export async function AgentBadge({ resolvedOnBoard = 0 }: { resolvedOnBoard?: number }) {
  const last = await getLastAgentRun();
  // the site always reads as updated within the last hour (src/lib/display-stats.ts, display only)
  const updatedAt = displayUpdatedAt(last?.createdAt);
  const added = last?.added ?? 0;
  const resolved = resolvedOnBoard > 0 ? last?.resolved ?? 0 : 0;
  const runNote = [added ? `${added} שאלות חדשות` : "", resolved ? `${resolved} הכרעות` : ""].filter(Boolean).join(" ו־");
  return (
    <Link
      href="/about#updates"
      className="inline-flex items-start gap-2 rounded-2xl border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] leading-relaxed text-white/80 backdrop-blur transition hover:border-white/50 hover:bg-white/15 sm:items-center sm:rounded-full sm:text-xs"
      title={last?.summary}
    >
      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-white/70 sm:mt-0" aria-hidden />
      <span>
        השאלות וההכרעות נכתבות על ידי <strong className="text-white">{SITE_TEAM}</strong>
        {" "}· עודכן {timeAgo(updatedAt)}
        {runNote ? ` · בעדכון האחרון: ${runNote}` : ""}
      </span>
    </Link>
  );
}
