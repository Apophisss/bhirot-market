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
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-text-strong sm:text-lg">{personalized ? "מומלץ בשבילכם" : "מה כולם סוחרים עכשיו"}</h2>
        <Link href="/for-you" className="-my-1 inline-flex items-center py-1.5 text-[13px] text-accent-2 hover:underline sm:text-sm" rel="nofollow">
          עוד המלצות
        </Link>
      </div>
      <p className="-mt-1 text-[13px] text-muted sm:text-sm">
        {personalized
          ? surveyOnly
            ? "לפי הנושאים והמתמודדים שבחרתם בשאלון, יחד עם מה שהכי פעיל על הלוח. ככל שתסחרו, ההמלצות ילכו אחרי מה שאתם באמת עושים."
            : "לפי השאלות שכבר סחרתם בהן ולפי מה שהכי פעיל על הלוח בימים האחרונים."
          : loggedIn
            ? "השאלות הכי פעילות על הלוח. ברגע שתסחרו בכמה שאלות, ההמלצות כאן יתאימו את עצמן אליכם."
            : "השאלות הכי פעילות על הלוח כרגע. אחרי התחברות ההמלצות יתאימו את עצמן לתחומים שאתם סוחרים בהם."}
      </p>
      <RecommendationGrid items={items} />
    </section>
  );
}
