"use client";

import { useState } from "react";

/** <img> that falls back to a local category cover if the remote photo fails to load. */
export function MarketImage({ src, fallback, alt, className }: { src: string; fallback: string; alt: string; className?: string }) {
  const [current, setCurrent] = useState(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (current !== fallback) setCurrent(fallback);
      }}
    />
  );
}
