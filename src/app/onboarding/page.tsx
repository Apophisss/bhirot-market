import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { listPmCandidates } from "@/lib/candidates";
import { getPeopleCounts, getCategoryCounts } from "@/lib/markets";
import { ensureSynced } from "@/lib/sync";
import { getPreferences, savePreferences } from "@/lib/preferences-store";
import { HORIZONS, MAX_PEOPLE, MAX_TOPICS } from "@/lib/preferences";
import { MarketImage } from "@/components/MarketImage";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "מה מעניין אתכם?",
  description: "שאלון קצר שקובע אילו שאלות יומלצו לכם ראשונות.",
  robots: { index: false, follow: true },
};

type Search = { next?: string; edit?: string };

/** Only same-site paths, and never a protocol-relative "//host" that leaves the site. */
function safeNext(next: string | undefined, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  /*
    The survey exists to order the deck, so the deck is where answering it leads: a
    first-time player arrives here straight from Google sign-in with no `next`, and
    sending them to the board made them pick a question out of a grid before they
    had answered a single one. Editing preferences later (`?edit=1`, from the user
    menu) is not that flow — "ביטול" there still means "back to the board".
  */
  const next = safeNext(sp.next, sp.edit === "1" ? "/" : "/rapid");
  const session = await auth();
  if (!session?.user?.id) {
    const cb = `/onboarding${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(cb)}`);
  }
  const userId = session.user.id;

  await ensureSynced();
  const [current, peopleCounts, categoryCounts] = await Promise.all([
    getPreferences(userId),
    getPeopleCounts("open"),
    getCategoryCounts("open"),
  ]);

  // arriving straight after login: already answered, nothing to ask again
  if (current && sp.edit !== "1") redirect(next);

  const candidates = listPmCandidates()
    .map((c) => ({ ...c, n: peopleCounts[c.id] ?? 0 }))
    .sort((a, b) => b.n - a.n);
  const topics = CATEGORIES.map((c) => ({ ...c, n: categoryCounts[c.id] ?? 0 })).filter((c) => c.n > 0);
  const editing = Boolean(current);

  async function save(formData: FormData) {
    "use server";
    const topics = formData.getAll("topics").map(String);
    const people = formData.getAll("people").map(String);
    const horizon = String(formData.get("horizon") ?? "mixed");
    await savePreferences(userId, { topics, people, horizon, status: "completed" });
    // counts, not choices: how many people finish the survey and how much they fill
    // in is the question here, and the answers themselves are already in the table
    await track(EVENTS.survey, {
      userId,
      path: "/onboarding",
      props: { status: "completed", topics: topics.length, people: people.length, horizon, editing: editing ? 1 : 0 },
    });
    redirect(next);
  }

  async function skip() {
    "use server";
    await savePreferences(userId, { status: "skipped", horizon: "mixed" });
    await track(EVENTS.survey, { userId, path: "/onboarding", props: { status: "skipped", editing: editing ? 1 : 0 } });
    redirect(next);
  }

  const chip =
    "tap pressable relative flex cursor-pointer select-none items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium text-muted transition hover:border-border-2 hover:text-text-strong has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:text-accent-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/60";

  return (
    <div className="mx-auto mt-2 max-w-3xl sm:mt-8">
      <form action={save} className="card space-y-7 p-5 sm:p-8">
        <header className="space-y-2">
          <p className="text-[13px] font-bold uppercase tracking-wide text-accent-2">
            {editing ? "ההעדפות שלי" : "שאלון קצר · פחות מדקה"}
          </p>
          <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">
            {editing ? "על מה בא לכם לשחק?" : "לפני שמתחילים — על מה בא לכם לשחק?"}
          </h1>
          <p className="text-[13px] leading-relaxed text-muted sm:text-sm">
            שלוש שאלות כלליות, בלי דעות פוליטיות ובלי שאלות אישיות. התשובות קובעות אילו שאלות
            נמליץ לכם ראשונות בלוח ובמצב הזריז — אפשר לדלג, ואפשר לשנות בכל רגע מתפריט המשתמש.
          </p>
        </header>

        <fieldset className="space-y-3">
          <legend className="text-base font-bold text-text-strong">
            1. אילו נושאים מעניינים אתכם?
            <span className="ms-2 text-xs font-normal text-muted-2">בחרו עד {MAX_TOPICS} · אפשר גם כלום</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {topics.map((c) => (
              <label key={c.id} className={chip}>
                <input
                  type="checkbox"
                  name="topics"
                  value={c.id}
                  defaultChecked={current?.topics.includes(c.id)}
                  className="sr-only"
                />
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.accent }} aria-hidden />
                {c.label}
                <span className="tabular text-xs text-muted-2">{c.n}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-base font-bold text-text-strong">
            2. על אילו מתמודדים תרצו לשחק?
            <span className="ms-2 text-xs font-normal text-muted-2">בחרו עד {MAX_PEOPLE}</span>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {candidates.map((c) => (
              <label
                key={c.id}
                className="tap pressable flex cursor-pointer select-none items-center gap-2.5 rounded-xl border border-border bg-surface p-2 transition hover:border-border-2 has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/60"
              >
                <input
                  type="checkbox"
                  name="people"
                  value={c.id}
                  defaultChecked={current?.people.includes(c.id)}
                  className="sr-only"
                />
                <MarketImage
                  src={c.image}
                  fallback="/covers/general.svg"
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover object-top"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold leading-tight text-text-strong">{c.name}</span>
                  <span className="block truncate text-[13px] text-muted">{c.list}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-base font-bold text-text-strong">3. איזה קצב מתאים לכם?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {HORIZONS.map((h) => (
              <label
                key={h.id}
                className="tap pressable cursor-pointer select-none rounded-xl border border-border bg-surface px-3.5 py-3 transition hover:border-border-2 has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/60"
              >
                <input
                  type="radio"
                  name="horizon"
                  value={h.id}
                  defaultChecked={(current?.horizon ?? "mixed") === h.id}
                  className="sr-only"
                />
                <span className="block text-sm font-bold text-text-strong">{h.label}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{h.note}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-center">
          <button className="tap pressable rounded-xl bg-accent px-6 py-3 font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2 sm:py-2.5">
            {editing ? "שמירה" : "שמירה והתחלה"}
          </button>
          {editing ? (
            <Link
              href={next}
              className="tap pressable flex items-center justify-center rounded-xl border border-border px-5 py-3 font-semibold text-muted hover:text-text-strong sm:py-2.5"
            >
              ביטול
            </Link>
          ) : (
            <button
              formAction={skip}
              formNoValidate
              className="tap pressable rounded-xl border border-border px-5 py-3 font-semibold text-muted hover:text-text-strong sm:py-2.5"
            >
              דילוג — תראו לי הכול
            </button>
          )}
          <p className="text-xs leading-relaxed text-muted-2 sm:ms-auto sm:max-w-[15rem]">
            זה משפיע רק על סדר ההמלצות. כל השאלות נשארות פתוחות לכולם.
          </p>
        </div>
      </form>
    </div>
  );
}
