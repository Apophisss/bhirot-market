import NextAuth, { type DefaultSession } from "next-auth";
import { cookies } from "next/headers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { REFERRAL_COOKIE } from "./referral";
import { claimReferral } from "./referral-program";
import { AD_COOKIE } from "./ad-attribution";
import { claimAdAttribution } from "./ad-conversions";
import { track } from "./analytics";
import { EVENTS } from "./events";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/** Password-less "quick login" for local development. Ignored in production builds, so a stray env var can't open the public site. */
export const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

/**
 * Credit the friend who sent the invite link, if this account arrived through one.
 * The code rides in a cookie that middleware stamps on `/i/<code>`, so it survives the
 * round trip to Google. Never fatal: a failed bonus must not fail the sign-in itself.
 */
async function claimPendingReferral(userId: string) {
  try {
    const jar = await cookies();
    const code = jar.get(REFERRAL_COOKIE)?.value;
    if (!code) return;
    await claimReferral(userId, code);
    // the cookie has done its job; a stale one would follow the user around for a month
    try {
      jar.delete(REFERRAL_COOKIE);
    } catch {
      // cookies are read-only outside route handlers and server actions
    }
  } catch (err) {
    console.error("[referral] claim failed", err);
  }
}

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const db = await getDb();
  return {
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    ...(googleEnabled ? [Google] : []),
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev",
            name: "כניסה מהירה (פיתוח)",
            credentials: { name: { label: "שם", type: "text" } },
            async authorize(credentials) {
              const name = String(credentials?.name ?? "").trim().slice(0, 40) || "משתמש/ת";
              const email = `${name.replace(/\s+/g, ".").toLowerCase()}@dev.local`;
              const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
              if (existing) return { id: existing.id, name: existing.name, email: existing.email, image: existing.image };
              const [created] = await db
                .insert(schema.users)
                .values({ name, email, image: null })
                .returning();
              // the adapter isn't in the loop for credentials logins, so no createUser event fires
              await claimPendingReferral(created.id);
              return { id: created.id, name: created.name, email: created.email, image: created.image };
            },
          }),
        ]
      : []),
  ],
  events: {
    // sign-ups and logins are recorded server-side, so no ad-blocker can hide them
    async createUser({ user }) {
      if (user.id) await claimPendingReferral(user.id);
      if (user.id) await claimAdAttribution(user.id, (await cookies()).get(AD_COOKIE)?.value);
      await track(EVENTS.signup, { userId: user.id, path: "/login" });
    },
    async signIn({ user, isNewUser }) {
      if (!isNewUser && user.id) await track(EVENTS.login, { userId: user.id, path: "/login" });
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
  };
});

export async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const db = await getDb();
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, session.user.id) });
  return row ?? null;
}
