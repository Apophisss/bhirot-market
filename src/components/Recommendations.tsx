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
    "מה כולם עונים עכשיו" has to be true of the cards under it — and "true of the
    cards" means the activity line the cards actually print, which is the display
    pair (src/lib/fake-market-stats.ts). Reading `tradeCount` here instead would put
    "עדיין כמעט לא ענו כאן" above six cards each advertising hundreds of answers,
    which is the contradiction this filter exists to avoid, only pointing the other
    way. The fallback heading is kept for the case it was written for: a board too
    small to fill the strip.
  */
  const traded = items.filter((r) => r.market.displayTradeCount > 0);
  const active = !personalized && traded.length >= 3;
  const shown = active ? traded : items;
  const heading = personalized ? "מומלץ בשבילכם" : active ? "מה כולם עונים עכשיו" : "שאלות להתחיל מהן";
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
            ? "לפי הנושאים והמתמודדים שבחרתם בשאלון, יחד עם מה שהכי פעיל על הלוח. ככל שתענו יותר, ההמלצות ילכו אחרי מה שאתם באמת עושים."
            : "לפי השאלות שכבר עניתם עליהן ולפי מה שהכי פעיל על הלוח בימים האחרונים."
          : !active
            ? "עדיין כמעט לא ענו כאן, אז אלה השאלות הפתוחות שהכי כדאי להתחיל מהן — התשובה הראשונה היא זו שקובעת את המד."
            : loggedIn
              ? "השאלות הכי פעילות על הלוח. ברגע שתענו על כמה שאלות, ההמלצות כאן יתאימו את עצמן אליכם."
              : "השאלות הכי פעילות על הלוח כרגע. אחרי התחברות ההמלצות יתאימו את עצמן לתחומים שאתם עונים עליהם."}
      </p>
      <RecommendationGrid items={shown} />
    </section>
  );
}
