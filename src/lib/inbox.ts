import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "./db";
import type { InboxStatus, SuggestionStatus } from "./db/schema";
import { CATEGORY_IDS } from "./categories";
import { CONTACT_TOPIC_IDS } from "./inbox-topics";

export { CONTACT_TOPICS, CONTACT_TOPIC_IDS, contactTopicLabel } from "./inbox-topics";

const { contactMessages, questionSuggestions, users } = schema;

export type ContactRow = typeof contactMessages.$inferSelect;
export type SuggestionRow = typeof questionSuggestions.$inferSelect;

/** An image the suggester may attach: a path under /public, or an https URL. */
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//i.test(v), "כתובת תמונה חייבת להתחיל ב-https:// או ב-/")
  .optional();

export const ContactInputSchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().email("כתובת אימייל לא תקינה").max(160),
  topic: z.enum(CONTACT_TOPIC_IDS).default("other"),
  body: z.string().trim().min(10, "כתבו לפחות 10 תווים").max(4000),
});
export type ContactInput = z.infer<typeof ContactInputSchema>;

export const SuggestionInputSchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().email("כתובת אימייל לא תקינה").max(160).optional().or(z.literal("")),
  title: z.string().trim().min(10, "השאלה קצרה מדי").max(180),
  description: z.string().trim().max(2000).optional(),
  resolutionCriteria: z.string().trim().max(2000).optional(),
  category: z.enum(CATEGORY_IDS).default("general"),
  imageUrl,
  /** the suggester's own estimate, in percent */
  probability: z.number().min(1).max(99).optional(),
  sourceUrl: z.string().trim().url("קישור לא תקין").max(500).optional().or(z.literal("")),
  /** yyyy-mm-dd, the target date of the question */
  closesAt: z.string().trim().max(40).optional().or(z.literal("")),
});
export type SuggestionInput = z.infer<typeof SuggestionInputSchema>;

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T20:59:59+03:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createContactMessage(
  input: ContactInput,
  user: { id: string; name: string | null; email: string | null } | null,
): Promise<ContactRow> {
  const db = await getDb();
  const [row] = await db
    .insert(contactMessages)
    .values({
      userId: user?.id ?? null,
      name: (input.name || user?.name || "").slice(0, 80),
      email: input.email || user?.email || "",
      topic: input.topic,
      body: input.body,
    })
    .returning();
  return row;
}

export async function createSuggestion(
  input: SuggestionInput,
  user: { id: string; name: string | null; email: string | null } | null,
): Promise<SuggestionRow> {
  const db = await getDb();
  const [row] = await db
    .insert(questionSuggestions)
    .values({
      userId: user?.id ?? null,
      name: (input.name || user?.name || "").slice(0, 80),
      email: input.email || user?.email || "",
      title: input.title,
      description: input.description ?? "",
      resolutionCriteria: input.resolutionCriteria ?? "",
      category: input.category,
      imageUrl: input.imageUrl || null,
      probability: input.probability ? input.probability / 100 : null,
      sourceUrl: input.sourceUrl || null,
      closesAt: parseDate(input.closesAt),
    })
    .returning();
  return row;
}

export interface InboxItem<T> {
  row: T;
  userName: string | null;
  userImage: string | null;
}

export async function listContactMessages(
  status: "all" | "new" | "open" | "done" = "all",
  limit = 100,
): Promise<InboxItem<ContactRow>[]> {
  const db = await getDb();
  const rows = await db
    .select({ row: contactMessages, userName: users.name, userImage: users.image })
    .from(contactMessages)
    .leftJoin(users, eq(contactMessages.userId, users.id))
    .where(status === "all" ? undefined : eq(contactMessages.status, status))
    .orderBy(desc(contactMessages.createdAt))
    .limit(limit);
  return rows;
}

export async function listSuggestions(
  status: "all" | "pending" | "approved" | "rejected" = "all",
  limit = 100,
): Promise<InboxItem<SuggestionRow>[]> {
  const db = await getDb();
  const rows = await db
    .select({ row: questionSuggestions, userName: users.name, userImage: users.image })
    .from(questionSuggestions)
    .leftJoin(users, eq(questionSuggestions.userId, users.id))
    .where(status === "all" ? undefined : eq(questionSuggestions.status, status))
    .orderBy(desc(questionSuggestions.createdAt))
    .limit(limit);
  return rows;
}

export async function getSuggestion(id: number): Promise<SuggestionRow | null> {
  const db = await getDb();
  const row = await db.query.questionSuggestions.findFirst({ where: eq(questionSuggestions.id, id) });
  return row ?? null;
}

export async function updateContactMessage(
  id: number,
  patch: { status?: InboxStatus; adminNote?: string },
): Promise<ContactRow | null> {
  const db = await getDb();
  const [row] = await db
    .update(contactMessages)
    .set({
      ...(patch.status ? { status: patch.status, handledAt: patch.status === "done" ? new Date() : null } : {}),
      ...(patch.adminNote !== undefined ? { adminNote: patch.adminNote || null } : {}),
    })
    .where(eq(contactMessages.id, id))
    .returning();
  return row ?? null;
}

export async function updateSuggestion(
  id: number,
  patch: { status?: SuggestionStatus; adminNote?: string; publishedSlug?: string },
): Promise<SuggestionRow | null> {
  const db = await getDb();
  const [row] = await db
    .update(questionSuggestions)
    .set({
      ...(patch.status ? { status: patch.status, reviewedAt: new Date() } : {}),
      ...(patch.adminNote !== undefined ? { adminNote: patch.adminNote || null } : {}),
      ...(patch.publishedSlug ? { publishedSlug: patch.publishedSlug } : {}),
    })
    .where(eq(questionSuggestions.id, id))
    .returning();
  return row ?? null;
}

/** Marks the suggestion a published market came from, so the dashboard can link the two. */
export async function markSuggestionPublished(id: number, slug: string): Promise<void> {
  const db = await getDb();
  await db
    .update(questionSuggestions)
    .set({ status: "approved", publishedSlug: slug, reviewedAt: new Date() })
    .where(eq(questionSuggestions.id, id));
}

export interface InboxCounts {
  messagesNew: number;
  messagesOpen: number;
  messagesTotal: number;
  messages7d: number;
  suggestionsPending: number;
  suggestionsApproved: number;
  suggestionsTotal: number;
  suggestions7d: number;
}

export async function getInboxCounts(now = Date.now()): Promise<InboxCounts> {
  const db = await getDb();
  const weekAgo = new Date(now - 7 * 86_400_000);
  const [byMsgStatus, byMsgWeek, bySugStatus, bySugWeek] = await Promise.all([
    db.select({ status: contactMessages.status, n: count() }).from(contactMessages).groupBy(contactMessages.status),
    db.select({ n: count() }).from(contactMessages).where(gte(contactMessages.createdAt, weekAgo)),
    db
      .select({ status: questionSuggestions.status, n: count() })
      .from(questionSuggestions)
      .groupBy(questionSuggestions.status),
    db.select({ n: count() }).from(questionSuggestions).where(gte(questionSuggestions.createdAt, weekAgo)),
  ]);
  const msg = Object.fromEntries(byMsgStatus.map((r) => [r.status, r.n]));
  const sug = Object.fromEntries(bySugStatus.map((r) => [r.status, r.n]));
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return {
    messagesNew: msg.new ?? 0,
    messagesOpen: msg.open ?? 0,
    messagesTotal: sum(msg),
    messages7d: byMsgWeek[0]?.n ?? 0,
    suggestionsPending: sug.pending ?? 0,
    suggestionsApproved: sug.approved ?? 0,
    suggestionsTotal: sum(sug),
    suggestions7d: bySugWeek[0]?.n ?? 0,
  };
}

/** The suggestions a single user sent, for the confirmation list on /suggest. */
export async function listUserSuggestions(userId: string, limit = 20): Promise<SuggestionRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(questionSuggestions)
    .where(and(eq(questionSuggestions.userId, userId), inArray(questionSuggestions.status, ["pending", "approved", "rejected"])))
    .orderBy(desc(questionSuggestions.createdAt))
    .limit(limit);
}
