"use client";

import { useState } from "react";

/**
 * <img> that falls back to a local category cover if the remote photo fails to load.
 *
 * `srcSet` is dropped along with `src` when that happens, so a card whose small WebP
 * thumbnail has not been generated yet (a person added between two runs of
 * `npm run people:fetch`) lands on whatever `fallback` names — the full-size photo, in
 * the case of `PeopleStack` — instead of retrying a file that is not there.
 */
export function MarketImage({
  src,
  srcSet,
  sizes,
  fallback,
  alt,
  className,
  style,
  title,
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  fallback: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed ? fallback : src}
      srcSet={failed ? undefined : srcSet}
      sizes={failed ? undefined : sizes}
      alt={alt}
      title={title}
      className={className}
      style={style}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!failed) setFailed(true);
      }}
    />
  );
}
