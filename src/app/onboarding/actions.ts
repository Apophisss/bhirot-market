"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { savePreferences } from "@/lib/preferences-store";

/**
 * "לא עכשיו" on the survey prompt. A skip is stored like any other answer, so the
 * prompt does not come back on the next page load — the survey stays reachable from
 * the user menu.
 */
export async function skipSurvey() {
  const session = await auth();
  if (!session?.user?.id) return;
  await savePreferences(session.user.id, { status: "skipped", horizon: "mixed" });
  revalidatePath("/");
}
