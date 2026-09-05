import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { track } from "./analytics";
import { EVENTS } from "./events";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/** Password-less "quick login" for local development. Ignored in production builds, so a stray env var can't open the public site. */
export const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

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
              return { id: created.id, name: created.name, email: created.email, image: created.image };
            },
          }),
        ]
      : []),
  ],
  events: {
    // sign-ups and logins are recorded server-side, so no ad-blocker can hide them
    async createUser({ user }) {
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
