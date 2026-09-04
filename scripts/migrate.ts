import { getDb } from "../src/lib/db";

getDb()
  .then(() => {
    console.log("migrations applied to", process.env.DATABASE_URL ?? "file:./data/local.db");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
