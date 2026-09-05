/** Scheduled date of the 26th Knesset election (updated by the editorial routine if an early election is set). */
export const ELECTION_DATE = "2026-10-27";
export const SITE_NAME = "בחירות מרקט";
/**
 * How the site describes itself, everywhere.
 *
 * It used to say "שוק החיזויים" — a prediction market. That is not what this is:
 * there is no money, nothing to deposit or withdraw and no prize, and describing a
 * free knowledge game in the vocabulary of a financial market misdescribes the
 * product to its visitors and files it under a category it does not belong to. The
 * tagline, the description and the keywords are the first thing that gets read —
 * by a person and by a crawler — so they are the first thing that has to be right.
 */
export const SITE_TAGLINE = "משחק הניחושים של בחירות 2026";
/** One-line site description, shared by <meta name="description">, the manifest and the JSON-LD graph. */
export const SITE_DESCRIPTION =
  "משחק ניחושים חינמי על בחירות 2026 לכנסת: סקרים, קואליציה, משפט נתניהו, חוק הגיוס ועוד. עונים כן או לא, צוברים נקודות, והשאלות נכתבות ומוכרעות על ידי צוות המערכת.";
export const SITE_KEYWORDS = [
  "בחירות 2026",
  "משחק ניחושים",
  "משחק ידע",
  "חידון פוליטי",
  "סקרים",
  "מנדטים",
  "הכנסת ה-26",
  "קואליציה",
  "נתניהו",
  "חוק הגיוס",
  "פוליטיקה ישראלית",
  "israeli politics quiz",
];
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
/** Byline for everything the site's editorial team publishes (questions, resolutions, updates). */
export const SITE_TEAM = "צוות המערכת";
/**
 * Address published on the privacy and terms pages. Google's ad review looks for a
 * way to reach the site owner, so set this before running ads; the sections that
 * quote it are hidden while it is empty rather than shipping a dead placeholder.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
/** Last substantive edit to the privacy policy / terms, shown to the reader. */
export const LEGAL_UPDATED = "2026-09-05";
/** Markets shipped with the repo are "seed"; anything else was added by the editorial team. */
export function isTeamAuthored(createdBy: string): boolean {
  return createdBy !== "seed";
}
