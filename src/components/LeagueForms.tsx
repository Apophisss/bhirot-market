"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEAGUE_NAME_MAX, LEAGUE_NAME_MIN } from "@/lib/social";

/** Post one action to `/api/leagues`, then follow the server's `href` or refresh. */
async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; href?: string }> {
  try {
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? "הפעולה נכשלה" };
    return { ok: true, href: typeof json.href === "string" ? json.href : undefined };
  } catch {
    return { ok: false, error: "אין חיבור לשרת" };
  }
}

/** Open a league. On success the browser lands on the new league's board. */
export function CreateLeagueForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await post({ action: "create", name });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? null);
      return;
    }
    setName("");
    if (res.href) router.push(res.href);
    else router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-sm font-semibold text-text-strong" htmlFor="league-name">
        שם הליגה
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="league-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LEAGUE_NAME_MAX}
          placeholder="החברים מהעבודה, משפחת כהן, כיתה י׳2…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none placeholder:text-muted-2 focus:border-accent focus:bg-surface"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length < LEAGUE_NAME_MIN}
          className="tap pressable shrink-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2 disabled:opacity-60"
        >
          {busy ? "פותחים…" : "פתיחת ליגה"}
        </button>
      </div>
      {error && <p className="text-[13px] font-semibold text-no">{error}</p>}
    </form>
  );
}

/** Join with a code or a pasted invite link — both are accepted, `normalizeLeagueCode` sorts it out. */
export function JoinLeagueForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await post({ action: "join", code });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? null);
      return;
    }
    setCode("");
    if (res.href) router.push(res.href);
    else router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-sm font-semibold text-text-strong" htmlFor="league-code">
        הצטרפות עם קישור או קוד
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="league-code"
          dir="ltr"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={200}
          placeholder="https://… או הקוד עצמו"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm outline-none placeholder:text-muted-2 focus:border-accent focus:bg-surface"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          className="tap pressable shrink-0 rounded-xl border border-accent/40 bg-accent/10 px-5 py-2.5 text-sm font-bold text-accent-2 hover:bg-accent/20 disabled:opacity-60"
        >
          {busy ? "מצטרפים…" : "הצטרפות"}
        </button>
      </div>
      {error && <p className="text-[13px] font-semibold text-no">{error}</p>}
    </form>
  );
}
