"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { FRIEND_SEARCH_MAX, FRIEND_SEARCH_MIN } from "@/lib/social";

interface Person {
  id: string;
  name: string | null;
  image: string | null;
  relation: "none" | "friends" | "requested" | "incoming" | "self";
}

/** What the button beside a search result says, and whether there is one at all. */
const LABEL: Record<Person["relation"], string> = {
  none: "הוספה",
  friends: "כבר חברים",
  requested: "נשלחה בקשה",
  incoming: "אישור הבקשה",
  self: "זה אתם",
};

/**
 * Find people by name and ask them.
 *
 * The search runs as you type, debounced, and each result carries only a name and a
 * picture — no score reaches this component until the other side has accepted, which
 * is the whole rule of the feature (see `src/lib/social.ts`).
 */
export function FriendSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  /**
   * The answer to one specific query, kept together with the query it answers. Holding
   * the two in one piece of state is what lets the render decide what to show — a
   * result belonging to an older query is simply not displayed — instead of an effect
   * reaching back to clear stale results as you type.
   */
  const [result, setResult] = useState<{ query: string; list: Person[]; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  // every keystroke starts a request; only the last one may write to the state
  const seq = useRef(0);
  const query = q.trim();

  useEffect(() => {
    const search = q.trim();
    if (search.length < FRIEND_SEARCH_MIN) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/friends?q=${encodeURIComponent(search)}`);
        const json = await res.json().catch(() => null);
        if (mine !== seq.current) return;
        if (!res.ok || !json?.ok) {
          setResult({ query: search, list: [], error: json?.error ?? "החיפוש נכשל" });
          return;
        }
        setResult({ query: search, list: json.people as Person[], error: null });
      } catch {
        if (mine === seq.current) setResult({ query: search, list: [], error: "אין חיבור לשרת" });
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  // a result for an older query is not this query's answer, so it is not shown
  const current = result && result.query === query ? result : null;
  const people = query.length >= FRIEND_SEARCH_MIN ? (current?.list ?? null) : null;
  const error = actionError ?? current?.error ?? null;

  async function act(person: Person) {
    setActing(person.id);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: person.relation === "incoming" ? "accept" : "request",
          userId: person.id,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setActionError(json?.error ?? "הפעולה נכשלה");
        return;
      }
      setActionError(null);
      setResult((r) =>
        r ? { ...r, list: r.list.map((p) => (p.id === person.id ? { ...p, relation: json.relation ?? "requested" } : p)) } : r,
      );
      // the lists below the box (requests, friends) are server-rendered
      router.refresh();
    } catch {
      setActionError("אין חיבור לשרת");
    } finally {
      setActing(null);
    }
  }

  const short = q.trim().length > 0 && q.trim().length < FRIEND_SEARCH_MIN;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-bold text-text-strong">חיפוש אנשים</h2>
        <p className="mt-0.5 text-[13px] text-muted">לפי השם שמופיע בחשבון. אנחנו לא מחפשים לפי כתובת מייל.</p>
      </div>
      <div className="p-4">
        <label className="relative block">
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            value={q}
            maxLength={FRIEND_SEARCH_MAX}
            onChange={(e) => setQ(e.target.value)}
            data-evt="friends-search"
            placeholder="שם של חבר/ה…"
            aria-label="חיפוש אנשים לפי שם"
            className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-10 pl-3 text-sm outline-none placeholder:text-muted-2 focus:border-accent focus:bg-surface"
          />
        </label>

        {short && <p className="mt-2 text-[13px] text-muted">צריך לפחות {FRIEND_SEARCH_MIN} תווים.</p>}
        {error && <p className="mt-2 text-[13px] font-semibold text-no">{error}</p>}

        {people && people.length === 0 && !busy && !short && (
          <p className="mt-3 text-sm text-muted">לא נמצא אף אחד בשם הזה. אפשר גם{" "}
            <a href="/invite" className="font-semibold text-accent-2 hover:underline">להזמין אותם לאתר</a>.
          </p>
        )}

        {people && people.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={p.name} image={p.image} size={32} seed={p.id} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{p.name ?? "אנונימי"}</span>
                {p.relation === "none" || p.relation === "incoming" ? (
                  <button
                    type="button"
                    onClick={() => act(p)}
                    disabled={acting === p.id}
                    className="tap pressable shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2 disabled:opacity-60"
                  >
                    {acting === p.id ? "רגע…" : LABEL[p.relation]}
                  </button>
                ) : (
                  <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-[13px] font-semibold text-muted">
                    {LABEL[p.relation]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
