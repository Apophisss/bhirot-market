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
 */
export function RapidCta({
  href = "/rapid",
  evt,
  title = "מצב זריז — שאלה אחרי שאלה",
  body = `כן או לא, ${RAPID_MIN_STAKE}–${RAPID_MAX_STAKE} נקודות לתשובה, והשאלה הבאה עולה מיד. זו הדרך המהירה לענות על הרבה שאלות.`,
  label = "למצב זריז",
  variant = "band",
  className = "",
}: {
  href?: string;
  /** click id from CLICK_IDS in src/lib/events.ts — says which surface sent the player */
  evt: string;
  title?: string;
  body?: string;
  label?: string;
  variant?: "band" | "line";
  className?: string;
}) {
  if (variant === "line") {
    return (
      <Link
        href={href}
        data-evt={evt}
        className={`tap pressable inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-bold text-accent-2 hover:bg-accent/20 ${className}`}
      >
        <BoltIcon />
        {label}
      </Link>
    );
  }

  return (
    <section className={`card flex flex-col gap-3 border-accent/40 bg-accent-soft p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5 ${className}`}>
      <div className="min-w-0 flex-1">
        <h2 className="inline-flex items-center gap-1.5 text-[15px] font-bold text-text-strong sm:text-base">
          <BoltIcon />
          {title}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted sm:text-sm">{body}</p>
      </div>
      <Link
        href={href}
        data-evt={evt}
        className="tap pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
      >
        <BoltIcon size={16} />
        {label}
      </Link>
    </section>
  );
}
