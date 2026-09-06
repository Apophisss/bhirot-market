import type { PersonPhoto } from "@/lib/markets";
import { MarketImage } from "./MarketImage";

/**
 * The two thumbnail widths `scripts/fetch-people.ts` writes beside every vendored photo.
 *
 * A card face is 44 to 56 CSS pixels, and the vendored original is 330 — the width
 * Wikimedia pre-renders. Serving that original to a card cost 310KB of portraits on one
 * home page; the 96px WebP is about 2.1KB of it. The `sizes` hint is the face's own CSS
 * width, so a 2x screen takes the 96 and a 3x phone takes the 192, and neither takes the
 * original. `fallback` is the original rather than the category cover on purpose: a
 * person whose thumbnails have not been generated yet must still show their own face.
 */
function thumbs(photo: PersonPhoto): { src: string; srcSet: string } | null {
  if (!photo.image.startsWith("/people/")) return null;
  const base = `/people/thumb/${photo.id}`;
  return { src: `${base}-96.webp`, srcSet: `${base}-96.webp 96w, ${base}-192.webp 192w` };
}

/** Overlapping photo stack for the people a market is about. */
export function PeopleStack({
  photos,
  fallback,
  size = 48,
  max = 3,
}: {
  photos: PersonPhoto[];
  fallback: string;
  size?: number;
  max?: number;
}) {
  if (!photos.length) {
    return (
      <MarketImage
        src={fallback}
        fallback={fallback}
        alt=""
        className="rounded-xl border border-border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const shown = photos.slice(0, max);
  const extra = photos.length - shown.length;
  return (
    <div className="flex shrink-0 items-center" style={{ height: size }}>
      {shown.map((p, i) => {
        const small = thumbs(p);
        return (
          <MarketImage
            key={p.id}
            src={small?.src ?? p.image}
            srcSet={small?.srcSet}
            sizes={`${size}px`}
            fallback={small ? p.image : fallback}
            alt={p.name}
            title={p.role ? `${p.name} — ${p.role}` : p.name}
            className="rounded-xl border-2 border-surface object-cover object-top"
            style={{ width: size, height: size, marginInlineStart: i ? -size * 0.38 : 0, zIndex: shown.length - i }}
          />
        );
      })}
      {extra > 0 && (
        <span
          className="flex items-center justify-center rounded-xl border-2 border-surface bg-surface-3 text-xs font-bold text-muted"
          style={{ width: size * 0.7, height: size, marginInlineStart: -size * 0.3 }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
