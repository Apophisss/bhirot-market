/**
 * Slug helpers for the dashboard's "new question" form.
 *
 * A market's slug is its primary key and its URL, so it has to be ascii kebab-case
 * (see MarketContentSchema). Hebrew titles leave nothing behind, hence the fallback.
 * Dependency-free so the browser form and the API route can share it.
 */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
}

/** A unique-enough slug for a title that has no ascii in it at all. */
export function fallbackSlug(at: Date = new Date(), rand = Math.random()): string {
  const d = at.toISOString().slice(0, 10).replace(/-/g, "");
  const tail = Math.floor(rand * 36 ** 4).toString(36).padStart(4, "0");
  return `q-${d}-${tail}`;
}

/**
 * The slug the form proposes for a title: derived when possible, generated otherwise.
 * A Hebrew title with a date in it ("…עד 30.11?") leaves only digits behind, which is
 * not a URL anyone can read — so a derived slug has to carry real words.
 */
export function suggestSlug(title: string, at?: Date): string {
  const s = slugify(title);
  const letters = s.replace(/[^a-z]/g, "").length;
  return letters >= 3 ? s : fallbackSlug(at);
}
