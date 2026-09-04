/** Scheduled date of the 26th Knesset election (updated by the editorial routine if an early election is set). */
export const ELECTION_DATE = "2026-10-27";
export const SITE_NAME = "בחירות מרקט";
export const SITE_TAGLINE = "שוק החיזויים של בחירות 2026";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
/** Byline for everything the site's editorial team publishes (questions, resolutions, updates). */
export const SITE_TEAM = "צוות המערכת";
/** Markets shipped with the repo are "seed"; anything else was added by the editorial team. */
export function isTeamAuthored(createdBy: string): boolean {
  return createdBy !== "seed";
}
