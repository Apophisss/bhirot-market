/** Scheduled date of the 26th Knesset election (updated by the editorial routine if an early election is set). */
export const ELECTION_DATE = "2026-10-27";
export const SITE_NAME = "בחירות מרקט";
export const SITE_TAGLINE = "שוק החיזויים של בחירות 2026";
/** One-line site description, shared by <meta name="description">, the manifest and the JSON-LD graph. */
export const SITE_DESCRIPTION =
  "שוק חיזויים בכסף וירטואלי על בחירות 2026 לכנסת: סקרים, קואליציה, משפט נתניהו, חוק הגיוס ועוד. השאלות נכתבות ומוכרעות על ידי צוות המערכת.";
export const SITE_KEYWORDS = [
  "בחירות 2026",
  "שוק חיזויים",
  "סקרים",
  "מנדטים",
  "הכנסת ה-26",
  "קואליציה",
  "נתניהו",
  "חוק הגיוס",
  "פוליטיקה ישראלית",
  "prediction market israel",
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
