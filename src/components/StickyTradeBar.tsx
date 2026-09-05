"use client";

import { useEffect, useState } from "react";
import { pct } from "@/lib/format";

/**
 * Phone-only buy bar. The market page is long (background, rules, trades, comments),
 * so once the trade panel scrolls away this keeps a one-thumb way back to it.
 */
export function StickyTradeBar({ probability }: { probability: number }) {
  const [show, setShow] = useState(false);
  /** the panel's own confirm bar wants the same strip; it wins, it is the later step */
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const el = document.getElementById("trade");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onBar = (e: Event) => setConfirming(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("market:confirm-bar", onBar);
    return () => window.removeEventListener("market:confirm-bar", onBar);
  }, []);

  function pick(side: "YES" | "NO") {
    window.dispatchEvent(new CustomEvent("market:pick-side", { detail: side }));
    document.getElementById("trade")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!show || confirming) return null;

  return (
    <div className="bottom-nav px-safe slide-up fixed inset-x-0 z-30 border-t border-border bg-bg/95 py-2 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-lg gap-2 px-3">
        <button
          onClick={() => pick("YES")}
          className="tap pressable flex-1 rounded-xl bg-yes/15 text-sm font-extrabold text-yes active:bg-yes active:text-white"
        >
          קניית כן {pct(probability)}
        </button>
        <button
          onClick={() => pick("NO")}
          className="tap pressable flex-1 rounded-xl bg-no/15 text-sm font-extrabold text-no active:bg-no active:text-white"
        >
          קניית לא {pct(1 - probability)}
        </button>
      </div>
    </div>
  );
}
