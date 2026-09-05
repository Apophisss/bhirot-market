import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  acceptLeagueInvite,
  createLeague,
  declineLeagueInvite,
  deleteLeague,
  inviteToLeague,
  joinLeague,
  leaveLeague,
  listLeagueInvites,
  listMyLeagues,
  removeMember,
} from "@/lib/leagues";
import { LEAGUE_NAME_MAX, leaguePath } from "@/lib/social";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().min(1).max(LEAGUE_NAME_MAX) }),
  z.object({ action: z.literal("join"), code: z.string().min(1).max(200) }),
  z.object({ action: z.literal("invite"), leagueId: z.number().int().positive(), userId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("accept"), leagueId: z.number().int().positive() }),
  z.object({ action: z.literal("decline"), leagueId: z.number().int().positive() }),
  z.object({ action: z.literal("leave"), leagueId: z.number().int().positive() }),
  z.object({ action: z.literal("delete"), leagueId: z.number().int().positive() }),
  z.object({ action: z.literal("remove"), leagueId: z.number().int().positive(), userId: z.string().min(1).max(64) }),
]);

function unauthorized() {
  return NextResponse.json({ ok: false, error: "צריך להתחבר" }, { status: 401 });
}

/** The caller's leagues and the invitations waiting for them. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();
  const [mine, invites] = await Promise.all([listMyLeagues(userId), listLeagueInvites(userId)]);
  return NextResponse.json({ ok: true, leagues: mine, invites });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "בקשה לא תקינה" }, { status: 400 });
  const body = parsed.data;

  // opening leagues is the one action that creates rows nobody asked for, so it is
  // capped harder than answering an invitation
  const key = body.action === "create" ? `league-create:${userId}` : `league-write:${userId}`;
  const limited =
    body.action === "create"
      ? rateLimit(key, 10, 60 * 60 * 1000)
      : rateLimit(key, 120, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "יותר מדי פעולות. נסו שוב מאוחר יותר." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  switch (body.action) {
    case "create": {
      const result = await createLeague(userId, body.name);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      await track(EVENTS.leagueCreate, { req, userId, path: "/leagues" });
      return NextResponse.json({
        ok: true,
        message: result.message,
        league: result.data,
        href: result.data ? `/leagues/${result.data.id}` : "/leagues",
      });
    }
    case "join": {
      const result = await joinLeague(userId, body.code);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      await track(EVENTS.leagueJoin, { req, userId, path: result.data ? leaguePath(result.data.code) : "/leagues" });
      return NextResponse.json({
        ok: true,
        message: result.message,
        league: result.data,
        href: result.data ? `/leagues/${result.data.id}` : "/leagues",
      });
    }
    case "invite": {
      const result = await inviteToLeague(userId, body.leagueId, body.userId);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    case "accept": {
      const result = await acceptLeagueInvite(userId, body.leagueId);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      await track(EVENTS.leagueJoin, { req, userId, path: "/leagues" });
      return NextResponse.json({ ok: true, message: result.message, href: `/leagues/${body.leagueId}` });
    }
    case "decline": {
      const result = await declineLeagueInvite(userId, body.leagueId);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    // both of these leave the caller standing on a page they can no longer read, so
    // they answer with where to go instead of relying on a refresh that would 404
    case "leave": {
      const result = await leaveLeague(userId, body.leagueId);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json({ ok: true, message: result.message, href: "/leagues" });
    }
    case "delete": {
      const result = await deleteLeague(userId, body.leagueId);
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json({ ok: true, message: result.message, href: "/leagues" });
    }
    case "remove": {
      const result = await removeMember(userId, body.leagueId, body.userId);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
  }
}
