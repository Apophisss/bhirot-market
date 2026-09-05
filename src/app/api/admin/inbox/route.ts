import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin";
import { unauthorized } from "@/lib/api-auth";
import { listContactMessages, listSuggestions, updateContactMessage, updateSuggestion } from "@/lib/inbox";

export const dynamic = "force-dynamic";

const Patch = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("message"),
    id: z.number().int().positive(),
    status: z.enum(["new", "open", "done"]).optional(),
    adminNote: z.string().max(2000).optional(),
  }),
  z.object({
    kind: z.literal("suggestion"),
    id: z.number().int().positive(),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    adminNote: z.string().max(2000).optional(),
  }),
]);

/** Triage one inbox item: move its status, or attach an internal note. */
export async function PATCH(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized("צריך הרשאת ניהול");
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "בקשה לא תקינה" }, { status: 400 });

  const p = parsed.data;
  const row =
    p.kind === "message"
      ? await updateContactMessage(p.id, { status: p.status, adminNote: p.adminNote })
      : await updateSuggestion(p.id, { status: p.status, adminNote: p.adminNote });
  if (!row) return NextResponse.json({ ok: false, error: "הפריט לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true, item: row });
}

/** The inbox as JSON, for scripts and for the editorial routine. */
export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return unauthorized("צריך הרשאת ניהול");
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const [messages, suggestions] = await Promise.all([
    kind === "suggestion" ? Promise.resolve([]) : listContactMessages("all", 200),
    kind === "message" ? Promise.resolve([]) : listSuggestions("all", 200),
  ]);
  return NextResponse.json({ ok: true, messages, suggestions });
}
