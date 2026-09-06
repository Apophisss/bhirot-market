/**
 * Downloads a photo for every person in data/people.json that has a `wiki`
 * (English Wikipedia article title), stores it under public/people/<id>.<ext>,
 * and points `image` at that local path. Photos are vendored rather than
 * hot-linked so the site never depends on upload.wikimedia.org at render time.
 *
 * It also writes the two small WebP thumbnails every card actually draws — see
 * `THUMB_WIDTHS`. Wikimedia hands out one pre-rendered width (330px), and a card draws
 * that photo at 44 CSS pixels: measured on the home page that was 310KB of portraits
 * for a strip of faces the size of a fingernail. The thumbnails are ~2.5KB each and
 * are committed alongside the originals, because the alternative — `next/image` at
 * request time — would spend the one vCPU the server needs for rendering.
 *
 *   npm run people:fetch              # only people without a local photo
 *   npm run people:fetch -- --force   # re-download everything
 *   npm run people:fetch -- --thumbs  # only (re)build thumbnails from what is on disk
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PeopleFileSchema } from "../src/lib/content";

const force = process.argv.includes("--force");
const thumbsOnly = process.argv.includes("--thumbs");
const OUT_DIR = "public/people";
const THUMB_DIR = "public/people/thumb";
/**
 * 96px covers a 44–56 CSS-pixel card face up to a 2x screen; 192px covers the same face
 * on a 3x phone and the 96px slot on a desktop. Nothing bigger belongs in a card, and
 * the 330px original stays for the candidate strip and the share cards, which draw the
 * photo large enough to see it.
 */
const THUMB_WIDTHS = [96, 192];
const UA = "bhirot-market/1.0 (politics guessing game)";

const raw = JSON.parse(fs.readFileSync("data/people.json", "utf8"));
const file = PeopleFileSchema.parse(raw);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });

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

/**
 * Writes `public/people/thumb/<id>-<width>.webp` for one person, from the original that
 * is already on disk. `withoutEnlargement` matters: a source narrower than the target
 * is left at its own width rather than upscaled into a blur, and the `srcset` the cards
 * carry still picks the right file because the browser measures the image it gets.
 */
async function thumbnails(id: string, image: string): Promise<number> {
  const src = path.join("public", image);
  if (!fs.existsSync(src)) return 0;
  let written = 0;
  for (const width of THUMB_WIDTHS) {
    const out = path.join(THUMB_DIR, `${id}-${width}.webp`);
    if (fs.existsSync(out) && !force && !thumbsOnly) continue;
    await sharp(src)
      .resize({ width, withoutEnlargement: true })
      // the faces are photographs, and 78 is where a 96px portrait stops improving
      .webp({ quality: 78, effort: 6 })
      .toFile(out);
    written++;
  }
  return written;
}

async function main() {
  let changed = 0;
  let thumbs = 0;

  if (thumbsOnly) {
    for (const p of file.people) {
      if (p.image?.startsWith("/people/")) thumbs += await thumbnails(p.id, p.image);
    }
    console.log(`wrote ${thumbs} thumbnails for ${file.people.length} people`);
    return;
  }

  for (const p of file.people) {
    if (!p.wiki) continue;
    const localExists = p.image?.startsWith("/people/") && fs.existsSync(path.join("public", p.image));
    // a photo that is already here still needs its thumbnails, which may be newer than it
    if (localExists && !force) {
      thumbs += await thumbnails(p.id, p.image!);
      continue;
    }
    await new Promise((r) => setTimeout(r, 1200)); // be polite to the Wikipedia API
    const t = await thumb(p.wiki);
    if (!t) {
      console.warn(`skip ${p.id}: no image found for ${p.wiki}`);
      continue;
    }
    const local = await download(t.url, p.id);
    if (!local) continue;
    p.image = local;
    p.imageSource = t.url;
    p.imageCredit = t.credit;
    thumbs += await thumbnails(p.id, local);
    changed++;
    console.log(`ok   ${p.id} -> ${local}`);
  }
  fs.writeFileSync("data/people.json", JSON.stringify({ people: file.people }, null, 2) + "\n");
  const missing = file.people.filter((x) => !x.image).map((x) => x.id);
  console.log(`updated ${changed} people; ${file.people.length - missing.length}/${file.people.length} have photos`);
  console.log(`wrote ${thumbs} thumbnails under ${THUMB_DIR}`);
  if (missing.length) console.log(`missing: ${missing.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
