/**
 * Rasterises public/logo.svg into the icons that only exist as PNG.
 *
 * Run after changing the logo:  npm run icons
 *
 * Everything on the site that can take an SVG already points at logo.svg. These
 * files cover the places that cannot: the iOS home screen (no SVG support, and no
 * transparency either — hence the flat background), the PWA install prompt, which
 * wants square 192/512 rasters, and /favicon.ico, which browsers request by path
 * whether or not the document links one.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "logo.svg");
/** the brand blue behind the mark; iOS composites the icon over it */
const BG = { r: 0x0d, g: 0x2a, b: 0x6b, alpha: 1 };

function png(size: number, flatten = false) {
  const img = sharp(SRC, { density: 384 }).resize(size, size, { fit: "contain" });
  return (flatten ? img.flatten({ background: BG }) : img).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * A one-image .ico wrapping a PNG.
 *
 * The ICO container has allowed PNG payloads since Vista, so the whole file is a
 * 6-byte header, one 16-byte directory entry and the PNG itself — no need for a
 * BMP encoder or a dependency that has one.
 */
function ico(image: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette colours
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, image]);
}

async function main() {
  const pub = path.join(ROOT, "public");
  await mkdir(pub, { recursive: true });

  const [i192, i512, apple, fav] = await Promise.all([png(192), png(512), png(180, true), png(32)]);

  await Promise.all([
    writeFile(path.join(pub, "icon-192.png"), i192),
    writeFile(path.join(pub, "icon-512.png"), i512),
    writeFile(path.join(pub, "apple-touch-icon.png"), apple),
    // app/favicon.ico is the Next convention: it is served at /favicon.ico and linked
    writeFile(path.join(ROOT, "src", "app", "favicon.ico"), ico(fav, 32)),
  ]);

  console.log("wrote icon-192.png, icon-512.png, apple-touch-icon.png, src/app/favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
