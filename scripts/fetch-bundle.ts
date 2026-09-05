/**
 * Downloads the site's analysis bundle to a local file, so it can be handed to an
 * agent ("נתח את הקובץ הזה ותשפר את האתר") without going through the browser.
 *
 *   SITE_URL=https://… ADMIN_TOKEN=… npm run bundle -- --days 90 --out bundle.json
 */
import { writeFile } from "node:fs/promises";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const site = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const token = process.env.ADMIN_TOKEN;
  const days = arg("days", "90");
  const format = arg("format", "json");
  const out = arg("out", `bhirot-market-${new Date().toISOString().slice(0, 10)}.${format === "md" ? "md" : "json"}`);

  const res = await fetch(`${site}/api/admin/bundle?days=${days}&format=${format}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    console.error(`✗ ${res.status} ${res.statusText} מ-${site}/api/admin/bundle`);
    if (res.status === 401) console.error("  חסר ADMIN_TOKEN בסביבה (ראו .env.example).");
    process.exit(1);
  }
  const body = await res.text();
  await writeFile(out, body, "utf8");
  console.log(`✓ נשמר ${out} (${(body.length / 1024).toFixed(1)}KB, ${days} ימים)`);
  console.log("  העבירו את הקובץ לסוכן יחד עם הפרומפט שמופיע ב-/admin/bundle.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
