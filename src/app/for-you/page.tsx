import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { ensureSynced } from "@/lib/sync";
import { getRecommendations, topCategories, TRENDING_WINDOW_HOURS } from "@/lib/recommendations";
import { RecommendationGrid } from "@/components/Recommendations";
import { CategoryTabs } from "@/components/CategoryTabs";
import { BoltIcon } from "@/components/BoltIcon";
import { findCategory } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "מומלץ בשבילכם",
  description: "שאלות שמותאמות לתחומים שאתם סוחרים בהם, לצד השאלות הכי פעילות על הלוח.",
  // the list is different for every visitor, so there is nothing here to index
  robots: { index: false, follow: true },
};

const LIMIT = 24;

export default async function ForYouPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await ensureSynced();
  const [sp, session] = await Promise.all([searchParams, auth()]);
  const category = sp.category && findCategory(sp.category) ? sp.category : "all";
  const loggedIn = Boolean(session?.user?.id);

  const { items, profile, personalized } = await getRecommendations({
    userId: session?.user?.id,
    limit: LIMIT,
    category,
  });
  const interests = topCategories(profile);
  // answered the survey but has not traded yet: the profile is real, the trading story is not
  const surveyOnly = Boolean(profile.survey) && profile.markets === 0;
  const askSurvey = loggedIn && !profile.survey;

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-extrabold text-text-strong sm:text-2xl">{personalized ? "מומלץ בשבילכם" : "מה כדאי לסחור עכשיו"}</h1>
          <p className="max-w-3xl text-[13px] text-muted sm:text-sm">
            {!personalized
              ? "כרגע זה פשוט הלוח לפי פעילות: כמה כסף וכמה סוחרים שונים עברו על כל שאלה, כמה קרובה ההכרעה וכמה השאלה עדיין פתוחה באמת."
              : surveyOnly
                ? "הדירוג משלב שני דברים: מה שבחרתם בשאלון הקצר, ומה שהכי פעיל על הלוח בימים האחרונים. שאלות שכבר עניתם עליהן לא חוזרות לכאן."
                : "הדירוג משלב שני דברים: התחומים והדמויות שאתם באמת סוחרים בהם, ומה שהכי פעיל על הלוח בימים האחרונים. שאלות שכבר עניתם עליהן לא חוזרות לכאן."}
          </p>
        </div>
        <Link
          href="/rapid"
          className="pressable inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-bold text-accent-2 hover:bg-accent/20"
        >
          <BoltIcon />
          סבב זריז
        </Link>
      </header>

      <section className="card space-y-2 p-3.5 sm:p-4">
        <h2 className="text-sm font-bold text-text-strong">איך נבחרו השאלות האלה</h2>
        {personalized ? (
          <>
            <p className="text-[13px] leading-relaxed text-muted sm:text-sm">
              {surveyOnly ? (
                <>
                  עוד לא סחרתם בשום שאלה, אז ההתאמה כאן נשענת על{" "}
                  <Link href="/onboarding?edit=1&next=%2Ffor-you" className="font-semibold text-accent-2 hover:underline">
                    התשובות שלכם בשאלון
                  </Link>
                  . ברגע שתתחילו לסחור, מה שתעשו בפועל יעלה על מה שסימנתם — עסקה טרייה שוקלת יותר מעסקה ישנה, וסכום גדול
                  יותר שוקל יותר מסכום קטן, אבל רק לוגריתמית.
                </>
              ) : (
                <>
                  בניתם פרופיל מ־<strong className="text-text-strong">{profile.markets}</strong> שאלות שסחרתם או הגבתם בהן. עסקה טרייה שוקלת
                  יותר מעסקה ישנה, וסכום גדול יותר שוקל יותר מסכום קטן — אבל רק לוגריתמית, כדי שעסקה אחת גדולה לא תשתלט על
                  הפרופיל.
                </>
              )}
            </p>
            {interests.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] text-muted">התחומים שלכם:</span>
                {interests.map((c) => (
                  <Link
                    key={c.id}
                    href={`/category/${c.id}`}
                    className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text hover:border-accent hover:text-accent-2 sm:text-xs"
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted sm:text-sm">
            עוד אין לנו מספיק מידע עליכם, אז הדירוג הוא לפי הפעילות של כולם ב־{TRENDING_WINDOW_HOURS} השעות האחרונות.{" "}
            {loggedIn ? (
              askSurvey ? (
                <>
                  <Link href="/onboarding?next=%2Ffor-you" className="font-bold text-accent-2 hover:underline">
                    ענו על השאלון הקצר
                  </Link>{" "}
                  ונדע כבר עכשיו אילו נושאים ומתמודדים להביא לכאן — או פשוט תסחרו, והרשימה תלמד מזה לבד.
                </>
              ) : (
                <>אחרי כמה עסקאות הרשימה כאן תתחיל להתאים את עצמה לתחומים שאתם בוחרים.</>
              )
            ) : (
              <>
                <Link href="/login?callbackUrl=%2Ffor-you" className="font-bold text-accent-2 hover:underline">
                  התחברו
                </Link>{" "}
                וקבלו ₪10,000 וירטואליים — ואז הרשימה תתחיל להתאים את עצמה אליכם.
              </>
            )}
          </p>
        )}
      </section>

      <CategoryTabs active={category} params={{}} basePath="/for-you" />

      {items.length ? (
        <RecommendationGrid items={items} />
      ) : (
        <p className="card p-6 text-center text-sm text-muted">
          אין כרגע שאלות פתוחות שמתאימות לסינון הזה.{" "}
          <Link href="/" className="font-semibold text-accent-2 hover:underline">
            לכל השווקים
          </Link>
        </p>
      )}
    </div>
  );
}
