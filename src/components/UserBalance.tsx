import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { money } from "@/lib/format";

export async function UserBalance() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <Link
      href="/portfolio"
      className="tabular hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-yes hover:border-border-2 sm:flex"
      title="היתרה הווירטואלית שלך"
    >
      <span className="text-muted-2">₪</span>
      {money(user.balance).replace("₪", "")}
    </Link>
  );
}
