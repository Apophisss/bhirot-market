import type { MarketView } from "@/lib/markets";
import { closesLabel, pct } from "@/lib/format";

/**
 * Every open question in one category, as plain text links.
 *
 * The board has ~350 open questions and the grid above shows twelve of them; the
 * rest were reachable only through `?show=`, whose target is `noindex`. A crawler
 * that will not index a page still follows the links on it, but it has to be given
 * links at all — and until this list existed, roughly half the questions on the site
 * had no followed internal link pointing at them and depended on the sitemap alone.
 *
 * Deliberately not cards: sixty `MarketCard`s would be another 200KB of HTML and a
 * second scrolling surface competing with the grid. Sixty rows of text are ~6KB, and
 * they are the last thing on the page, where a reader who got that far is looking for
 * a question the grid did not show them.
 *
 * Plain `<a>` rather than `<Link>` on purpose: `<Link>` prefetches on hover and on
 * viewport entry, and sixty prefetches of a `force-dynamic` route is sixty extra
 * renders on a single-core server for a list most visitors will never click.
 */
export function QuestionIndex({
  heading,
  items,
  note,
}: {
  heading: string;
  items: MarketView[];
  /** the line under the heading, explaining what the list is */
  note?: string;
}) {
  if (!items.length) return null;
  return (
    <section className="card p-5">
      <h2 className="text-base font-bold text-text-strong">{heading}</h2>
      {note && <p className="mt-1 text-[13px] text-muted">{note}</p>}
      {/*
        Every row's styling is declared once on the <ul> instead of on each row. With
        sixty rows the class attributes were the largest thing on the page after the
        questions themselves — about 13KB of repeated Tailwind, and Next ships the tree
        twice (the HTML and the RSC payload behind it), so it cost double that.
      */}
      <ul className="mt-3 grid gap-x-6 text-sm sm:grid-cols-2 [&>li]:border-t [&>li]:border-border [&>li]:py-2 [&>li:first-child]:border-t-0 sm:[&>li:nth-child(-n+2)]:border-t-0 [&_a]:text-text [&_a:hover]:text-accent-2 [&_a:hover]:underline [&_span]:whitespace-nowrap [&_span]:text-xs [&_span]:text-muted-2">
        {items.map((m) => (
          <li key={m.id}>
            <a href={`/market/${m.id}`}>{m.title}</a>{" "}
            <span className="tabular">
              {pct(m.probability)} כן · {closesLabel(m.closesAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
