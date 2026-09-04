"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Avatar dropdown. A plain <details> stays open when you tap elsewhere on a phone,
 * so this closes on outside tap, on Escape and on every navigation.
 */
export function UserMenu({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // close on navigation (adjusting state during render, as the React docs prescribe)
  const pathname = usePathname();
  const [route, setRoute] = useState(pathname);
  if (route !== pathname) {
    setRoute(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="תפריט המשתמש"
        className="flex items-center gap-2 rounded-full border border-border bg-surface-2 p-1 ps-1 pe-2 hover:border-border-2 sm:pe-3"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-ink/10"
        >
          {children}
        </div>
      )}
    </div>
  );
}
