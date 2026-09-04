/**
 * Syncs data/markets.json into the database (local file or Turso, per DATABASE_URL).
 * Run: npm run markets:sync
 */
import { syncFromContent } from "../src/lib/sync";

syncFromContent("cli")
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
