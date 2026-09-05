import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

declare global {
  var __bhirotDb: { client: Client; db: Db; ready: Promise<void> } | undefined;
}

function createDb() {
  const url = process.env.DATABASE_URL ?? "file:./data/local.db";
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  const db = drizzle(client, { schema });
  const ready = (async () => {
    if (url.startsWith("file:")) {
      // In the default rollback journal a COMMIT needs an exclusive lock, so any
      // page render (a reader) can bounce a concurrent trade with SQLITE_BUSY.
      // WAL lets readers and the writer proceed together. Turso does its own
      // locking server-side and rejects these pragmas, hence the file: guard.
      await client.execute("PRAGMA journal_mode=WAL");
      await client.execute("PRAGMA synchronous=NORMAL");
    }
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  })().catch((err) => {
    console.error("[db] init failed", err);
    throw err;
  });
  return { client, db, ready };
}

/** Returns the (singleton) database after migrations have been applied. */
export async function getDb(): Promise<Db> {
  if (!globalThis.__bhirotDb) globalThis.__bhirotDb = createDb();
  await globalThis.__bhirotDb.ready;
  return globalThis.__bhirotDb.db;
}

export { schema };
