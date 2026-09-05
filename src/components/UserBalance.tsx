import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { money } from "@/lib/format";

export async function UserBalance() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <Link
      href="/portfolio"
      className="tabular flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] font-semibold text-yes hover:border-border-2 sm:gap-1.5 sm:px-3 sm:text-sm"
      title="היתרה הווירטואלית שלך"
    >
      <span className="text-muted-2">₪</span>
      {money(user.balance).replace("₪", "")}
    </Link>
  );
}
