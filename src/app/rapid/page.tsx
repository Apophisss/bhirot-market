import Link from "next/link";
import type { Metadata } from "next";
import { auth, currentUser } from "@/lib/auth";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";
import { shareCard } from "@/lib/seo";
import { ensureSynced } from "@/lib/sync";
import { listRapidCards } from "@/lib/rapid-feed";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE, RAPID_SORTS, type RapidSort } from "@/lib/rapid";
import { CategoryTabs } from "@/components/CategoryTabs";
import { RapidDeck } from "@/components/RapidDeck";
import { BoltIcon } from "@/components/BoltIcon";
import { SurveyPrompt } from "@/components/SurveyPrompt";
import { GUEST_LIMIT } from "@/lib/rapid-guest";
import { shouldOfferSurvey } from "@/lib/survey-offer";

export const dynamic = "force-dynamic";

const DESCRIPTION = `שאלה אחרי שאלה: עונים כן או לא ב-${RAPID_MIN_STAKE}–${RAPID_MAX_STAKE} נקודות מחייבות וממשיכים הלאה.`;

type Search = { category?: string; sort?: string; all?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const sp = await searchParams;
  // the deck is one page; the category/sort/all switches only reshuffle the same
  // questions, so they get the same treatment as the listing filters
  const noise = Boolean((sp.category && sp.category !== "all") || sp.sort || sp.all);
  return {
    title: "מצב זריז",
    description: DESCRIPTION,
    ...(noise ? { robots: { index: false, follow: true } } : { alternates: { canonical: "/rapid" } }),
    ...shareCard({ title: `מצב זריז | ${SITE_NAME}`, description: DESCRIPTION, path: "/rapid" }),
  };
}

export default async function RapidPage({ searchParams }: { searchParams: Promise<Search> }) {
  await ensureSynced();
  const sp = await searchParams;
  const category = sp.category ?? "all";
  const sort = (RAPID_SORTS.find((s) => s.id === sp.sort)?.id ?? "mix") as RapidSort;
  // "כולל שאלות שכבר ראיתי": both halves of what the deck subtracts — the questions
  // this user answered, and the ones they skipped (see src/lib/rapid-feed.ts)
  const includeAnswered = sp.all === "1";

  const [session, user] = await Promise.all([auth(), currentUser()]);
  const loggedIn = Boolean(session?.user?.id);
  const [cards, askSurvey] = await Promise.all([
    listRapidCards({ userId: user?.id ?? null, category, sort, includeAnswered }),
    // סדר החפיסה כאן הוא בדיוק מה שהשאלון קובע, ולכן זה המקום להציע אותו למי שעדיין לא ענה
    shouldOfferSurvey(session?.user?.id),
  ]);

  const link = (patch: Partial<Search>) => {
    const next = { ...sp, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === "category" && v === "all") && !(k === "sort" && v === "mix")) usp.set(k, v);
    }
    const s = usp.toString();
    return s ? `/rapid?${s}` : "/rapid";
  };

  // from lg the deck puts the stake panel in a column of its own, so the page needs
  // the extra width to keep the card itself as wide as it is on a phone
  return (
    <div className="deck-page deck-height mx-auto flex w-full max-w-3xl flex-col gap-2 short:gap-1.5 sm:gap-3 lg:max-w-6xl">
      <div className="scrollbar-none swipe-x -mx-3 flex shrink-0 items-center gap-1 px-3 text-xs sm:mx-0 sm:flex-wrap sm:justify-between sm:px-0">
        <div className="flex shrink-0 items-center gap-1">
          <h1 className="me-1 inline-flex items-center gap-1 font-black text-text-strong"><BoltIcon /> מצב זריז</h1>
          {RAPID_SORTS.map((s) => (
            <Link
              key={s.id}
              href={link({ sort: s.id })}
              className={`tap inline-flex shrink-0 items-center rounded-lg px-2.5 font-semibold ${sort === s.id ? "bg-surface-2 text-text-strong" : "text-muted hover:text-text"}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={link({ all: includeAnswered ? undefined : "1" })}
            className={`tap inline-flex shrink-0 items-center rounded-lg border px-2.5 font-semibold ${
              includeAnswered ? "border-accent bg-accent/15 text-accent-2" : "border-border text-muted hover:text-text"
            }`}
          >
            כולל שאלות שכבר ראיתי
          </Link>
          <Link href="/" className="tap inline-flex shrink-0 items-center rounded-lg px-2.5 font-semibold text-muted hover:text-text">
            לרשימה המלאה
          </Link>
        </div>
      </div>

      {/* A short phone cannot afford a row that says nothing: with no category chosen the
          tabs step aside, but once one is active they stay — otherwise the deck would look
          like the whole board while quietly serving a single category, with no way back. */}
      <CategoryTabs
        active={category}
        params={{ sort: sp.sort, all: sp.all }}
        basePath="/rapid"
        className={`shrink-0 ${category === "all" ? "short:hidden" : ""}`}
      />

      {!loggedIn && (
        <p className="shrink-0 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-[13px] leading-snug text-text short:py-1 short:text-xs sm:py-2 sm:text-sm">
          {GUEST_LIMIT} תשובות ראשונות בלי חשבון — הן נשמרות, ו
          <Link href="/login?callbackUrl=%2Frapid" className="inline-flex min-h-11 items-center font-bold text-accent-2 hover:underline">
            התחברות
          </Link>{" "}
          מכניסה אותן לניקוד שלכם.
        </p>
      )}

      {askSurvey && <SurveyPrompt next="/rapid" compact />}

      <RapidDeck
        key={`${category}:${sort}:${includeAnswered}`}
        cards={cards}
        loggedIn={loggedIn}
        balance={user?.balance ?? null}
        includeAnswered={includeAnswered}
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
        {includeAnswered ? "אין כרגע שאלות פתוחות" : "עברתם על כל השאלות הפתוחות"}
      </h2>
      <p className="max-w-md text-sm text-muted">
        {SITE_TEAM} מוסיף שאלות חדשות לאורך היום לפי החדשות. בינתיים אפשר לחזור לשאלות שכבר עניתם עליהן או שדילגתם עליהן, או לעבור לרשימת השאלות.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {!includeAnswered && (
          <Link
            href={category === "all" ? "/rapid?all=1" : `/rapid?category=${category}&all=1`}
            className="tap pressable flex items-center justify-center rounded-xl bg-accent px-5 font-bold text-white hover:bg-accent-2"
          >
            הצג גם שאלות שכבר ראיתי
          </Link>
        )}
        {category !== "all" && (
          <Link href="/rapid" className="tap pressable flex items-center justify-center rounded-xl border border-border-2 px-5 font-semibold hover:bg-surface-2">
            כל הקטגוריות
          </Link>
        )}
        <Link href="/" className="tap pressable flex items-center justify-center rounded-xl border border-border-2 px-5 font-semibold hover:bg-surface-2">
          לרשימת השאלות
        </Link>
      </div>
    </div>
  );
}
