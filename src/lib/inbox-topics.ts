/**
 * The subjects a "contact us" message can carry.
 *
 * A leaf module with no database import, so the browser form and the server route
 * share one list (and one set of ids) without pulling libSQL into the bundle.
 */
export const CONTACT_TOPICS = [
  { id: "question", label: "שאלה על האתר" },
  { id: "market", label: "טעות בשוק מסוים" },
  { id: "bug", label: "באג באתר" },
  { id: "idea", label: "רעיון לשיפור" },
  { id: "other", label: "אחר" },
] as const;

export const CONTACT_TOPIC_IDS = CONTACT_TOPICS.map((t) => t.id) as [string, ...string[]];

export function contactTopicLabel(id: string): string {
  return CONTACT_TOPICS.find((t) => t.id === id)?.label ?? id;
}
