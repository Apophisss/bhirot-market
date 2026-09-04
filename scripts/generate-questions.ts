/**
 * Runs the in-app question generator once against the configured DATABASE_URL.
 * Requires ANTHROPIC_API_KEY. Pass --dry-run to only print proposals.
 * Run: npm run markets:generate
 */
import { runQuestionGenerator } from "../src/lib/agent/generate";

runQuestionGenerator({ source: "cli", dryRun: process.argv.includes("--dry-run") })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
