import type { PersonPhoto } from "@/lib/markets";
import { MarketImage } from "./MarketImage";

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
      {shown.map((p, i) => (
        <MarketImage
          key={p.id}
          src={p.image}
          fallback={fallback}
          alt={p.name}
          title={p.role ? `${p.name} — ${p.role}` : p.name}
          className="rounded-xl border-2 border-surface object-cover object-top"
          style={{ width: size, height: size, marginInlineStart: i ? -size * 0.38 : 0, zIndex: shown.length - i }}
        />
      ))}
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
