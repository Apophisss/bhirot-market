import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "drizzle/**"] },
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
