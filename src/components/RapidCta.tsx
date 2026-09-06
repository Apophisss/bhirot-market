import Link from "next/link";
import { BoltIcon } from "./BoltIcon";
import { RAPID_MAX_STAKE, RAPID_MIN_STAKE } from "@/lib/rapid";

/**
 * The one call to action the site repeats everywhere: "מצב זריז".
 *
 * Answering question after question in the deck is what the site is *for* — the
 * board, the category pages, the leaderboard and the activity feed all exist to
 * bring someone to it. Every page that ends without a next question used to end
 * with nothing at all (a 404, a table of strangers, a question already answered),
 * so this component is the shared end-of-page exit, kept in one file so the
 * wording, the glyph and the tracking id stay identical on all of them.
 *
 * `line` is the thin variant for a page that already carries a heavy header (a
 * category band, a market page sidebar); `band` is the full card.
 *
 * `promo` is the strip that opens the home page, above the hero, on a phone and on
 * a desktop alike. A visitor who lands on the board sees a grid of questions and
 * has no way of knowing that answering them one after the other — and not reading
 * the grid — is what the site is built around, so the strip says so in one line
 * before anything else on the page does.
 */
export function RapidCta({
  href = "/rapid",
  evt,
  title,
  body,
  label,
  variant = "band",
  className = "",
}: {
  href?: string;
  /** click id from CLICK_IDS in src/lib/events.ts — says which surface sent the player */
  evt: string;
  title?: string;
  body?: string;
  label?: string;
  variant?: "band" | "line" | "promo";
  className?: string;
}) {
  const heading = title ?? (variant === "promo" ? "מצב זריז — ככה משחקים" : "מצב זריז — שאלה אחרי שאלה");
  const text =
    body ??
    (variant === "promo"
      ? "המצב הליבתי של המשחק — שאלה על המסך, כן או לא, והבאה עולה מיד."
      : `כן או לא, ${RAPID_MIN_STAKE}–${RAPID_MAX_STAKE} נקודות לתשובה, והשאלה הבאה עולה מיד. זו הדרך המהירה לענות על הרבה שאלות.`);
  const cta = label ?? (variant === "promo" ? "מתחילים" : "למצב זריז");

  if (variant === "promo") {
    // One tap target, not a card with a button inside it: the whole strip is the
    // link, and the pill at its end is only what the eye lands on. A phone has
    // ~200px left for the copy once the glyph and the pill are counted, so there
    // the pill gives way to the arrow and the two lines of text get the width.
    return (
      <Link
        href={href}
        data-evt={evt}
        className={`card card-hover flex items-center gap-3 border-accent/40 bg-accent-soft px-3.5 py-3 sm:gap-4 sm:px-5 sm:py-3.5 ${className}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/25 sm:h-10 sm:w-10">
          <BoltIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-text-strong sm:text-base">{heading}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted sm:text-sm">{text}</span>
        </span>
        <span className="pressable hidden shrink-0 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 sm:inline-flex">
          {cta}
        </span>
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-accent sm:hidden" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    );
  }

  if (variant === "line") {
    return (
      <Link
        href={href}
        data-evt={evt}
        className={`tap pressable inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-bold text-accent-2 hover:bg-accent/20 ${className}`}
      >
        <BoltIcon />
        {cta}
      </Link>
    );
  }

  return (
    <section className={`card flex flex-col gap-3 border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5 ${className}`}>
      <div className="min-w-0 flex-1">
        <h2 className="inline-flex items-center gap-1.5 text-[15px] font-bold text-text-strong sm:text-base">
          <BoltIcon />
          {heading}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted sm:text-sm">{text}</p>
      </div>
      <Link
        href={href}
        data-evt={evt}
        className="tap pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
      >
        <BoltIcon size={16} />
        {cta}
      </Link>
    </section>
  );
}
