import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // .claude/worktrees is where parallel agents check the repo out (Agent tool,
  // isolation: worktree). Each one is a full copy of src/, so without this eslint
  // lints the same file once per worktree — and a file an agent deletes mid-run
  // makes the whole lint exit with ENOENT rather than a lint error.
  { ignores: [".next/**", "node_modules/**", "drizzle/**", ".claude/worktrees/**"] },
  // The fabricated chart history is display-only. Keep the generator sealed: it may
  // not reach the database, the market maker or the content pipeline...
  {
    files: ["src/lib/synthetic-history.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["*", "**/*"] },
      ],
    },
  },
  // The quiet-market drift decides a REAL price, which is exactly why its policy is
  // sealed the same way: a pure function of its arguments, so the price written to
  // the database can be recomputed and checked by `scripts/test-drift.ts`. The
  // database, the clock and the randomness all live in `market-drift.ts`.
  {
    files: ["src/lib/drift.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["*", "**/*"] },
      ],
    },
  },
  // ...and nothing that decides money, prices or persisted content may read it.
  {
    files: ["src/lib/trade.ts", "src/lib/sync.ts", "src/lib/portfolio.ts", "src/lib/lmsr.ts", "src/lib/markets.ts", "src/lib/agent/*.ts", "scripts/sync.ts", "scripts/generate-questions.ts", "scripts/merge-markets.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/synthetic-history", "**/display-history"],
              message: "display-only chart data must never reach prices, positions or data/markets.json",
            },
          ],
        },
      ],
    },
  },
]);
