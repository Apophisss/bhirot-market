"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TONES = {
  primary: "bg-accent text-white shadow-md shadow-accent/25 hover:bg-accent-2",
  soft: "border border-accent/40 bg-accent/10 text-accent-2 hover:bg-accent/20",
  ghost: "border border-border text-text hover:border-accent hover:text-accent-2",
  danger: "border border-no/40 text-no hover:bg-no/10",
} as const;

/**
 * One button that posts a small JSON action and re-renders the page it lives on.
 *
 * Every write in the friends and leagues screens is exactly this shape — a verb, an
 * id, and a server that answers `{ok}` or `{ok:false,error}` — so they share one
 * button instead of a form per verb. The result of a successful action is whatever the
 * server now says the page should show, which is why the default is `router.refresh()`
 * rather than local state: the friends list, the badge in the header and the league
 * table all move together.
 */
export function PostButton({
  endpoint,
  body,
  label,
  pendingLabel,
  doneLabel,
  tone = "ghost",
  confirm,
  navigate = false,
  evt,
  className = "",
}: {
  endpoint: string;
  body: Record<string, unknown>;
  label: string;
  pendingLabel?: string;
  /** shown instead of the label once the action succeeded and the page is refreshing */
  doneLabel?: string;
  tone?: keyof typeof TONES;
  /** ask first — for the irreversible ones (deleting a league, unfriending) */
  confirm?: string;
  /** follow the `href` the server returns (joining a league lands on its board) */
  navigate?: boolean;
  evt?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "משהו השתבש. נסו שוב.");
        return;
      }
      setDone(true);
      startTransition(() => {
        if (navigate && typeof json.href === "string") router.push(json.href);
        else router.refresh();
      });
    } catch {
      setError("אין חיבור לשרת. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;
  return (
    <span className="inline-flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={run}
        disabled={working || done}
        data-evt={evt}
        className={`tap pressable inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60 ${TONES[tone]} ${className}`}
      >
        {working ? (pendingLabel ?? "רגע…") : done ? (doneLabel ?? label) : label}
      </button>
      {error && <span className="text-[13px] font-semibold text-no">{error}</span>}
    </span>
  );
}
