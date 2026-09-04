/**
 * Fills in `image` for every person in data/people.json that has a `wiki`
 * (English Wikipedia article title) but no image yet, using the Wikipedia
 * REST summary endpoint. Pass --force to refresh all.
 * Run: npm run people:fetch
 */
import fs from "node:fs";
import { PeopleFileSchema } from "../src/lib/content";

const force = process.argv.includes("--force");
const raw = JSON.parse(fs.readFileSync("data/people.json", "utf8"));
const file = PeopleFileSchema.parse(raw);

async function thumb(title: string, attempt = 0): Promise<{ url: string; credit: string } | null> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { "user-agent": "bhirot-market/1.0 (prediction market demo)", accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return thumb(title, attempt + 1);
    }
    console.warn(`  ${title}: HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { type?: string; thumbnail?: { source: string }; originalimage?: { source: string } };
  if (data.type === "disambiguation") {
    console.warn(`  ${title}: disambiguation page — pick a more specific title`);
    return null;
  }
  // Wikimedia only serves the pre-rendered thumbnail width the API hands out (usually 330px),
  // so keep that URL as-is and just drop the tracking query string.
  const src = data.thumbnail?.source;
  if (!src) return null;
  const url = src.split("?")[0];
  return { url, credit: `Wikimedia Commons (${title.replace(/_/g, " ")})` };
}

async function main() {
let changed = 0;
for (const p of file.people) {
  if (!p.wiki || (p.image && !force)) continue;
  await new Promise((r) => setTimeout(r, 1500)); // be polite to the Wikipedia API
  const t = await thumb(p.wiki);
  if (t) {
    p.image = t.url;
    p.imageCredit = t.credit;
    changed++;
    console.log(`✓ ${p.id} -> ${t.url}`);
  } else {
    console.warn(`✗ ${p.id}: no image found for ${p.wiki}`);
  }
}
fs.writeFileSync("data/people.json", JSON.stringify({ people: file.people }, null, 2) + "\n");
console.log(`updated ${changed} people`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
