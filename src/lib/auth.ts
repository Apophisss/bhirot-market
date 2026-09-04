import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/** Password-less "quick login" for local development. Never set ALLOW_DEV_LOGIN=true on a public deployment. */
export const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true";

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
