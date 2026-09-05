import Link from "next/link";
import type { Recommendation } from "@/lib/recommendations";
import { MarketCard } from "./MarketCard";

/** The reason chips are the whole point of the section: a pick nobody can explain reads as noise. */
export function RecommendationGrid({ items }: { items: Recommendation[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
      {items.map((r) => (
        <MarketCard key={r.market.id} m={r.market} note={r.reasons.map((x) => x.label).join(" · ")} />
      ))}
    </div>
  );
}

/**
 * The home-page block. `personalized` decides the whole framing: with something to go
 * on it is "picked for you", without it is honestly just "what everyone else is trading
 * right now". `surveyOnly` separates the two ways of having something to go on — the
 * subtitle must not credit trades to a user who has not made any yet.
 */
export function RecommendationSection({
  items,
  personalized,
  loggedIn,
  surveyOnly = false,
}: {
  items: Recommendation[];
  personalized: boolean;
  loggedIn: boolean;
  /** the personal half comes from the survey answers alone, with no trading history behind it */
  surveyOnly?: boolean;
}) {
  if (!items.length) return null;
  /*
    "מה כולם סוחרים עכשיו" has to be true of the cards under it. On a young board
    most picks carry ₪0 volume and 0 trades, and a strip of untraded questions
    under that heading is contradicted by the cards themselves. So: prefer the
    picks that have actually been traded, and when there are not enough of those,
    keep the cards and change the claim instead of keeping the claim and losing
    six questions from the top of the page.
  */
  const traded = items.filter((r) => r.market.tradeCount > 0);
  const active = !personalized && traded.length >= 3;
  const shown = active ? traded : items;
  const heading = personalized ? "מומלץ בשבילכם" : active ? "מה כולם סוחרים עכשיו" : "שאלות להתחיל מהן";
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-text-strong sm:text-lg">{heading}</h2>
        <Link href="/rapid" className="tap -my-1 inline-flex items-center text-[13px] text-accent-2 hover:underline sm:text-sm" rel="nofollow">
          לענות עליהן במצב זריז
        </Link>
      </div>
      <p className="-mt-1 text-[13px] text-muted sm:text-sm">
        {personalized
          ? surveyOnly
            ? "לפי הנושאים והמתמודדים שבחרתם בשאלון, יחד עם מה שהכי פעיל על הלוח. ככל שתסחרו, ההמלצות ילכו אחרי מה שאתם באמת עושים."
            : "לפי השאלות שכבר סחרתם בהן ולפי מה שהכי פעיל על הלוח בימים האחרונים."
          : !active
            ? "עדיין אין כאן הרבה מסחר, אז אלה השאלות הפתוחות שהכי כדאי להתחיל מהן — התשובה הראשונה היא זו שקובעת את המחיר."
            : loggedIn
              ? "השאלות הכי פעילות על הלוח. ברגע שתסחרו בכמה שאלות, ההמלצות כאן יתאימו את עצמן אליכם."
              : "השאלות הכי פעילות על הלוח כרגע. אחרי התחברות ההמלצות יתאימו את עצמן לתחומים שאתם סוחרים בהם."}
      </p>
      <RecommendationGrid items={shown} />
    </section>
  );
}
