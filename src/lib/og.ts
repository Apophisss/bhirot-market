import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Assets for the generated share cards (`opengraph-image.tsx`).
 *
 * Satori — the renderer behind `next/og` — has no font of its own, so the Hebrew
 * glyphs have to be handed to it as TrueType. `next/font` only ever produces
 * woff2, which satori cannot read, hence the two vendored `.ttf` files under
 * `public/fonts`. They are Heebo 400 and 800, the same family the site itself
 * loads, taken from the TrueType URLs that Google Fonts serves to a browser
 * without woff2 support:
 *
 *   curl -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Heebo:wght@400;800"
 *
 * They are read from disk once per process and memoised: a crawler pulling many
 * market cards in a row should pay for this once.
 */

/** Site palette, duplicated here because satori has no access to the stylesheet. */
export const OG = {
  brand: "#0d2a6b",
  brandDeep: "#081a45",
  accent: "#2563eb",
  yes: "#22c55e",
  no: "#f87171",
  ink: "#ffffff",
  muted: "#a9bce4",
} as const;

export const OG_SIZE = { width: 1200, height: 630 } as const;

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" };

let fonts: Promise<OgFont[]> | undefined;

/** Heebo 400 + 800 as satori expects them. Memoised for the life of the process. */
export function ogFonts(): Promise<OgFont[]> {
  fonts ??= Promise.all([
    readFile(path.join(FONT_DIR, "heebo-400.ttf")),
    readFile(path.join(FONT_DIR, "heebo-800.ttf")),
  ]).then(([regular, bold]): OgFont[] => [
    { name: "Heebo", data: Uint8Array.from(regular).buffer, weight: 400, style: "normal" },
    { name: "Heebo", data: Uint8Array.from(bold).buffer, weight: 800, style: "normal" },
  ]);
  return fonts;
}

/**
 * A `/public` image as a data URI, or undefined if it is not a photo we can embed.
 *
 * Satori cannot fetch, and it cannot rasterise SVG inside `<img>`, so the category
 * covers (all SVG) are deliberately rejected here and the card falls back to its
 * illustration-free layout. The path is matched against a strict shape rather than
 * merely resolved: it comes from `data/people.json` today, but a card is a public
 * endpoint and one traversal away from serving arbitrary files.
 */
export async function embedPhoto(src: string | undefined): Promise<string | undefined> {
  if (!src) return undefined;
  const match = /^\/people\/([a-z0-9-]+)\.(jpg|jpeg|png)$/i.exec(src);
  if (!match) return undefined;
  const mime = match[2].toLowerCase() === "png" ? "image/png" : "image/jpeg";
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "people", `${match[1]}.${match[2]}`));
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    // a photo listed in the data file but missing on disk must not 500 the card
    return undefined;
  }
}

/** Hard character cap for card text — satori has no ellipsis for multi-line blocks. */
export function fit(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}
