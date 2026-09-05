import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  removeFriend,
  searchPeople,
  sendFriendRequest,
} from "@/lib/friends";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { EVENTS } from "@/lib/events";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["request", "accept", "decline", "cancel", "remove"]),
  userId: z.string().min(1).max(64),
});

function unauthorized() {
  return NextResponse.json({ ok: false, error: "צריך להתחבר" }, { status: 401 });
}

/**
 * `?q=` searches people by name; without it, the caller's own friends and pending
 * requests. Both are signed-in only — the friends graph is not public, and neither is
 * the fact that a given name has an account here.
 */
export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();

  const q = new URL(req.url).searchParams.get("q");
  if (q !== null) {
    // a search is one query against the user table; cheap, but not free
    const limited = rateLimit(`friend-search:${userId}`, 60, 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { ok: false, error: "יותר מדי חיפושים. רגע." },
        { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
      );
    }
    return NextResponse.json({ ok: true, people: await searchPeople(userId, q) });
  }

  const [friends, incoming, outgoing] = await Promise.all([
    listFriends(userId),
    listIncomingRequests(userId),
    listOutgoingRequests(userId),
  ]);
  return NextResponse.json({ ok: true, friends, incoming, outgoing });
}

/** Ask, answer, take back or undo — every write the friends page can make. */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "בקשה לא תקינה" }, { status: 400 });
  const { action, userId: otherId } = parsed.data;

  // the cap that actually matters is MAX_PENDING_REQUESTS in friends.ts; this one just
  // stops a script from hammering the endpoint
  const limited = rateLimit(`friend-write:${userId}`, 60, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "יותר מדי פעולות. נסו שוב מאוחר יותר." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  const result =
    action === "request"
      ? await sendFriendRequest(userId, otherId)
      : action === "accept"
        ? await acceptFriendRequest(userId, otherId)
        : action === "decline"
          ? await declineFriendRequest(userId, otherId)
          : action === "cancel"
            ? await cancelFriendRequest(userId, otherId)
            : await removeFriend(userId, otherId);

  if (!result.ok) return NextResponse.json(result, { status: 400 });
  // recorded server-side, like trades and comments, so the dashboard sees what happened
  // — the event carries the action, never who was asked
  if (action === "request" || action === "accept") {
    await track(action === "request" ? EVENTS.friendRequest : EVENTS.friendAccept, {
      req,
      userId,
      path: "/friends",
    });
  }
  return NextResponse.json(result);
}
