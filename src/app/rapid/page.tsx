import Link from "next/link";
import type { Metadata } from "next";
import { auth, currentUser, googleEnabled } from "@/lib/auth";
import { GUEST_LIMIT } from "@/lib/rapid-guest";
import { SITE_NAME, SITE_TEAM } from "@/lib/config";
import { shareCard } from "@/lib/seo";
import { ensureSynced } from "@/lib/sync";
import { listRapidCards } from "@/lib/rapid-feed";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE, RAPID_SORTS, type RapidSort } from "@/lib/rapid";
import { CategoryTabs } from "@/components/CategoryTabs";
import { CATEGORIES } from "@/lib/categories";
import { RapidDeck } from "@/components/RapidDeck";
import { BoltIcon } from "@/components/BoltIcon";
import { SurveyPrompt } from "@/components/SurveyPrompt";
import { shouldOfferSurvey } from "@/lib/survey-offer";
import { getSettings } from "@/lib/settings-store";
import { parseRapidSort, type SettingsPatch } from "@/lib/settings";
import { RememberDeckView } from "@/components/RememberDeckView";
import { GuestRunBanner } from "@/components/GuestRunBanner";

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
  /** the category the deck is filtered to, if it is filtered at all */
  const activeCategory = CATEGORIES.find((c) => c.id === category) ?? null;

  const [session, user] = await Promise.all([auth(), currentUser()]);
  const loggedIn = Boolean(session?.user?.id);
  const settings = await getSettings(session?.user?.id);

  /*
    איך נקבע מה מוצג: ה-URL מנצח, ומה שלא נאמר בו נלקח מהחשבון.

    המיון ו"כולל שאלות שכבר ראיתי" הם בחירה של המשתמש כמו כל בחירה אחרת באתר, והם
    היו היחידים ששכחנו: כל כניסה חדשה ל-`/rapid` — ובפרט מכל מכשיר אחר — החזירה את
    ברירת המחדל. לכן קישור מפורש עדיין קובע (אפשר לשלוח כתובת ולקבל בדיוק אותה
    חפיסה), אבל כתובת שלא אומרת כלום מקבלת את מה שהחשבון בחר בפעם האחרונה.
    בגלל זה גם כפתורי הכיבוי כותבים `sort=mix` ו-`all=0` במקום להשמיט: השמטה
    פירושה עכשיו "כמו שנשמר", ולא "ברירת מחדל".
  */
  const sortParam = parseRapidSort(sp.sort);
  const sort: RapidSort = sortParam ?? settings.rapidSort;
  // "כולל שאלות שכבר ראיתי": both halves of what the deck subtracts — the questions
  // this user answered, and the ones they skipped (see src/lib/rapid-feed.ts)
  const includeAnswered = sp.all != null ? sp.all === "1" : settings.rapidIncludeAnswered;

  const [cards, askSurvey] = await Promise.all([
    // A guest can answer GUEST_LIMIT cards and pays, on a phone, for every card the
    // page ships twice (markup and RSC payload): sixty cards were 548KB of HTML to
    // parse and hydrate before the first tap. A short deck for the free run, with a
    // few spare for skips; the wall comes long before the end of it.
    listRapidCards({ userId: user?.id ?? null, category, sort, includeAnswered, limit: loggedIn ? undefined : GUEST_LIMIT + 6 }),
    // סדר החפיסה כאן הוא בדיוק מה שהשאלון קובע, ולכן זה המקום להציע אותו למי שעדיין לא ענה
    shouldOfferSurvey(session?.user?.id),
  ]);

  // מה שהמשתמש שינה עכשיו ביחס למה ששמור — נשמר מהדפדפן, כדי שרינדור של דף (GET)
  // לא יכתוב במסד בדרך אגב
  const remember: SettingsPatch | null = (() => {
    if (!loggedIn) return null;
    const patch: SettingsPatch = {};
    if (sortParam && sortParam !== settings.rapidSort) patch.rapidSort = sortParam;
    if (sp.all != null && includeAnswered !== settings.rapidIncludeAnswered) {
      patch.rapidIncludeAnswered = includeAnswered;
    }
    return Object.keys(patch).length ? patch : null;
  })();

  /*
    מה החפיסה תזכור אחרי הרינדור הזה — ולא מה היא זכרה לפניו.

    זה ההבדל שמכריע איך נראים הקישורים: משתמש מחובר שהגיע ל-`?sort=hot` כותב את
    "hot" לחשבון תוך כדי (`remember`), ולכן קישור "מומלץ בשבילי" שנבנה מול הערך
    *הישן* היה יוצא `/rapid` — כתובת שכבר פירושה "כמו שנשמר", כלומר hot. ההקשה על
    מיון אחד הייתה מחזירה את הקודם. לאורח אין לאן לכתוב, ולכן אצלו מה שנשמר הוא
    ברירת המחדל, וה-URL הוא זה שנושא את התצוגה — בדיוק כמו קודם.
  */
  const persisted = loggedIn
    ? { sort, includeAnswered }
    : { sort: settings.rapidSort, includeAnswered: settings.rapidIncludeAnswered };

  /**
   * הקישורים של הסרגל: כל קישור נושא את התצוגה השלמה, ומשמיט בדיוק את מה שממילא
   * יישמר — כי כתובת שלא אומרת דבר על המיון פירושה מעכשיו "כמו שנשמר". כך `/rapid`
   * נשארת הכתובת של החפיסה כפי שהמשתמש הזה מכיר אותה, ולא נולדה כתובת ארוכה חדשה
   * לכל הקשה.
   */
  const link = (patch: Partial<Search>) => {
    const next: Record<string, string | undefined> = {
      ...sp,
      sort,
      all: includeAnswered ? "1" : "0",
      ...patch,
    };
    if (next.sort === persisted.sort) delete next.sort;
    if (next.all != null && (next.all === "1") === persisted.includeAnswered) delete next.all;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === "category" && v === "all")) usp.set(k, v);
    }
    const s = usp.toString();
    return s ? `/rapid?${s}` : "/rapid";
  };

  // from lg the deck puts the stake panel in a column of its own, so the page needs
  // the extra width to keep the card itself as wide as it is on a phone
  return (
    <div className="deck-page deck-height mx-auto flex w-full max-w-3xl flex-col gap-2 short:gap-1.5 sm:gap-3 lg:max-w-6xl">
      {/* `sm:flex-wrap` is for a wide window with room to spare. A phone held sideways is
          wide and has none: wrapping there costs the card another 44px row, so the row
          stays one line and scrolls, exactly as it does in portrait. */}
      <div className="scrollbar-none swipe-x -mx-3 flex shrink-0 items-center gap-1 px-3 text-xs flat:flex-nowrap sm:mx-0 sm:flex-wrap sm:justify-between sm:px-0">
        <div className="flex shrink-0 items-center gap-1">
          <h1 className="me-1 inline-flex items-center gap-1 font-black text-text-strong"><BoltIcon /> מצב זריז</h1>
          {/* The category the deck is serving, and the way out of it — on a phone, where
              the strip of tabs below costs the card a row of its own (measured: a 375px
              phone went from a 241px card to 187px, and the question stopped fitting).
              This row is already here and scrolls sideways, so the same two facts —
              which category, and how to leave it — cost nothing. */}
          {activeCategory && (
            <Link
              href={link({ category: "all" })}
              aria-label={`${activeCategory.label} — להצגת כל הקטגוריות`}
              className="tap hidden shrink-0 items-center gap-1.5 rounded-lg border border-accent bg-accent/15 px-2.5 font-semibold text-accent-2 short:inline-flex"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: activeCategory.accent }} aria-hidden />
              {activeCategory.label}
              <span aria-hidden className="text-muted-2">✕</span>
            </Link>
          )}
          {/* The sorts and the "seen" switch are a player's controls: they are saved to
              the account and shape a deck the account has history in. A guest's deck is
              the board's recommended order, and a stranger's first minute has five
              fewer links to wander off through. */}
          {loggedIn &&
            RAPID_SORTS.map((s) => (
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
          {loggedIn && (
            <Link
              href={link({ all: includeAnswered ? "0" : "1" })}
              className={`tap inline-flex shrink-0 items-center rounded-lg border px-2.5 font-semibold ${
                includeAnswered ? "border-accent bg-accent/15 text-accent-2" : "border-border text-muted hover:text-text"
              }`}
            >
              כולל שאלות שכבר ראיתי
            </Link>
          )}
          <Link href="/" className="tap inline-flex shrink-0 items-center rounded-lg px-2.5 font-semibold text-muted hover:text-text">
            לרשימה המלאה
          </Link>
        </div>
      </div>

      {/* A phone cannot afford a whole row of tabs above a card that is already short —
          not even to say which category is on, which is what the chip in the row above
          now says, with the way back to all of them on it. From `sm` up the strip is
          back, and switching category is one tap again. */}
      <CategoryTabs
        active={category}
        params={{
          sort: sort === persisted.sort ? undefined : sort,
          all: includeAnswered === persisted.includeAnswered ? undefined : includeAnswered ? "1" : "0",
        }}
        basePath="/rapid"
        className="shrink-0 short:hidden"
      />

      {/* the free run, counted down in the browser rather than quoted from the server.
          It is one row and one tap target on a phone, and steps aside entirely on the
          shortest screens — see GuestRunBanner for what that costs and why. */}
      {!loggedIn && <GuestRunBanner />}

      {askSurvey && <SurveyPrompt next="/rapid" compact />}

      {remember && <RememberDeckView patch={remember} />}

      <RapidDeck
        key={`${category}:${sort}:${includeAnswered}`}
        cards={cards}
        loggedIn={loggedIn}
        balance={user?.balance ?? null}
        savedStake={loggedIn ? settings.rapidStake : null}
        includeAnswered={includeAnswered}
        googleEnabled={googleEnabled}
      >
        <EmptyFeed
          includeAnswered={includeAnswered}
          withAnsweredHref={link({ all: "1" })}
          allCategoriesHref={category === "all" ? null : link({ category: "all" })}
        />
      </RapidDeck>
    </div>
  );
}

function EmptyFeed({
  includeAnswered,
  withAnsweredHref,
  allCategoriesHref,
}: {
  includeAnswered: boolean;
  withAnsweredHref: string;
  /** null when the deck is already showing every category */
  allCategoriesHref: string | null;
}) {
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
            href={withAnsweredHref}
            className="tap pressable flex items-center justify-center rounded-xl bg-accent px-5 font-bold text-white hover:bg-accent-2"
          >
            הצג גם שאלות שכבר ראיתי
          </Link>
        )}
        {allCategoriesHref && (
          <Link href={allCategoriesHref} className="tap pressable flex items-center justify-center rounded-xl border border-border-2 px-5 font-semibold hover:bg-surface-2">
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
