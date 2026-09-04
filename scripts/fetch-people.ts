/**
 * Downloads a photo for every person in data/people.json that has a `wiki`
 * (English Wikipedia article title), stores it under public/people/<id>.<ext>,
 * and points `image` at that local path. Photos are vendored rather than
 * hot-linked so the site never depends on upload.wikimedia.org at render time.
 *
 *   npm run people:fetch            # only people without a local photo
 *   npm run people:fetch -- --force # re-download everything
 */
import fs from "node:fs";
import path from "node:path";
import { PeopleFileSchema } from "../src/lib/content";

const force = process.argv.includes("--force");
const OUT_DIR = "public/people";
const UA = "bhirot-market/1.0 (prediction market demo; contact via GitHub Apophisss/bhirot-market)";

const raw = JSON.parse(fs.readFileSync("data/people.json", "utf8"));
const file = PeopleFileSchema.parse(raw);
fs.mkdirSync(OUT_DIR, { recursive: true });

interface Thumb {
  url: string;
  credit: string;
}

async function thumb(title: string, attempt = 0): Promise<Thumb | null> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return thumb(title, attempt + 1);
    }
    console.warn(`  ${title}: HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    type?: string;
    thumbnail?: { source: string };
  };
  if (data.type === "disambiguation") {
    console.warn(`  ${title}: disambiguation page — use a more specific article title`);
    return null;
  }
  // Wikimedia only serves the pre-rendered thumbnail width the API hands out,
  // so keep that URL and just drop the tracking query string.
  const src = data.thumbnail?.source;
  if (!src) return null;
  return { url: src.split("?")[0], credit: `Wikimedia Commons — ${title.replace(/_/g, " ")}` };
}

async function download(url: string, id: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) {
    console.warn(`  ${id}: download failed HTTP ${res.status}`);
    return null;
  }
  const type = res.headers.get("content-type") ?? "";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) {
    console.warn(`  ${id}: suspiciously small file (${buf.length}b), skipping`);
    return null;
  }
  const rel = path.join(OUT_DIR, `${id}.${ext}`);
  fs.writeFileSync(rel, buf);
  return `/people/${id}.${ext}`;
}

async function main() {
  let changed = 0;
  for (const p of file.people) {
    if (!p.wiki) continue;
    const localExists = p.image?.startsWith("/people/") && fs.existsSync(path.join("public", p.image));
    if (localExists && !force) continue;
    await new Promise((r) => setTimeout(r, 1200)); // be polite to the Wikipedia API
    const t = await thumb(p.wiki);
    if (!t) {
      console.warn(`✗ ${p.id}: no image found for ${p.wiki}`);
      continue;
    }
    const local = await download(t.url, p.id);
    if (!local) continue;
    p.image = local;
    p.imageSource = t.url;
    p.imageCredit = t.credit;
    changed++;
    console.log(`✓ ${p.id} -> ${local}`);
  }
  fs.writeFileSync("data/people.json", JSON.stringify({ people: file.people }, null, 2) + "\n");
  const missing = file.people.filter((x) => !x.image).map((x) => x.id);
  console.log(`updated ${changed} people; ${file.people.length - missing.length}/${file.people.length} have photos`);
  if (missing.length) console.log(`missing: ${missing.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
