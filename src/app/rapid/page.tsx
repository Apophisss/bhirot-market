import Link from "next/link";
import { auth, currentUser } from "@/lib/auth";
import { SITE_TEAM } from "@/lib/config";
import { ensureSynced } from "@/lib/sync";
import { listRapidFeed, toRapidCard } from "@/lib/rapid-feed";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE, RAPID_SORTS, type RapidSort } from "@/lib/rapid";
import { CategoryTabs } from "@/components/CategoryTabs";
import { RapidDeck } from "@/components/RapidDeck";
import { BoltIcon } from "@/components/BoltIcon";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "מצב זריז",
  description: `שאלה אחרי שאלה: עונים כן או לא בסכום מחייב של ₪${RAPID_MIN_STAKE}–₪${RAPID_MAX_STAKE} וממשיכים הלאה.`,
};

type Search = { category?: string; sort?: string; all?: string };

export default async function RapidPage({ searchParams }: { searchParams: Promise<Search> }) {
  await ensureSynced();
  const sp = await searchParams;
  const category = sp.category ?? "all";
  const sort = (RAPID_SORTS.find((s) => s.id === sp.sort)?.id ?? "mix") as RapidSort;
  const includeAnswered = sp.all === "1";

  const [session, user] = await Promise.all([auth(), currentUser()]);
  const loggedIn = Boolean(session?.user?.id);
  const feed = await listRapidFeed({ userId: user?.id ?? null, category, sort, includeAnswered });
  const cards = feed.map(toRapidCard);

  const link = (patch: Partial<Search>) => {
    const next = { ...sp, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === "category" && v === "all") && !(k === "sort" && v === "mix")) usp.set(k, v);
    }
    const s = usp.toString();
    return s ? `/rapid?${s}` : "/rapid";
  };

  return (
    <div className="deck-height mx-auto flex w-full max-w-3xl flex-col gap-2 sm:gap-3">
      <div className="scrollbar-none swipe-x -mx-3 flex shrink-0 items-center gap-1 px-3 text-xs sm:mx-0 sm:flex-wrap sm:justify-between sm:px-0">
        <div className="flex shrink-0 items-center gap-1">
          <h1 className="me-1 inline-flex items-center gap-1 font-black text-text-strong"><BoltIcon /> מצב זריז</h1>
          {RAPID_SORTS.map((s) => (
            <Link
              key={s.id}
              href={link({ sort: s.id })}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 font-semibold ${sort === s.id ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={link({ all: includeAnswered ? undefined : "1" })}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 font-semibold ${
              includeAnswered ? "border-accent bg-accent/15 text-accent-2" : "border-border text-muted hover:text-text"
            }`}
          >
            כולל שאלות שכבר עניתי
          </Link>
          <Link href="/" className="shrink-0 rounded-lg px-2.5 py-1.5 font-semibold text-muted hover:text-text">
            לרשימה המלאה
          </Link>
        </div>
      </div>

      <CategoryTabs active={category} params={{ sort: sp.sort, all: sp.all }} basePath="/rapid" className="shrink-0" />

      {!loggedIn && (
        <p className="shrink-0 rounded-xl border border-warn/40 bg-warn/10 px-3 py-1.5 text-[13px] leading-snug text-text sm:py-2 sm:text-sm">
          אתם בתצוגה בלבד.{" "}
          <Link href="/login?callbackUrl=%2Frapid" className="font-bold text-accent-2 hover:underline">
            התחברו
          </Link>{" "}
          <span className="hidden sm:inline">כדי שכל תשובה תהפוך לפוזיציה אמיתית בכסף הווירטואלי שלכם.</span>
          <span className="sm:hidden">כדי שכל תשובה תהפוך לפוזיציה אמיתית.</span>
        </p>
      )}

      <RapidDeck
        key={`${category}:${sort}:${includeAnswered}`}
        cards={cards}
        loggedIn={loggedIn}
        balance={user?.balance ?? null}
      >
        <EmptyFeed category={category} includeAnswered={includeAnswered} />
      </RapidDeck>
    </div>
  );
}

function EmptyFeed({ category, includeAnswered }: { category: string; includeAnswered: boolean }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center sm:p-12">
      <h2 className="text-xl font-extrabold text-text-strong">
        {includeAnswered ? "אין כרגע שאלות פתוחות" : "ענית על כל השאלות הפתוחות"}
      </h2>
      <p className="max-w-md text-sm text-muted">
        {SITE_TEAM} מוסיף שאלות חדשות כל שעה לפי החדשות. בינתיים אפשר לחזור לשאלות שכבר עניתם עליהן, או לעבור לרשימת השווקים.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {!includeAnswered && (
          <Link
            href={category === "all" ? "/rapid?all=1" : `/rapid?category=${category}&all=1`}
            className="tap pressable flex items-center justify-center rounded-xl bg-accent px-5 font-bold text-white hover:bg-accent-2"
          >
            הצג גם שאלות שעניתי
          </Link>
        )}
        {category !== "all" && (
          <Link href="/rapid" className="tap pressable flex items-center justify-center rounded-xl border border-border-2 px-5 font-semibold hover:bg-surface-2">
            כל הקטגוריות
          </Link>
        )}
        <Link href="/" className="tap pressable flex items-center justify-center rounded-xl border border-border-2 px-5 font-semibold hover:bg-surface-2">
          לרשימת השווקים
        </Link>
      </div>
    </div>
  );
}
