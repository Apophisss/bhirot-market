"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { timeAgo } from "@/lib/format";
import { gaEvent } from "@/lib/gtag";

export interface CommentItem {
  id: number;
  body: string;
  createdAt: string | Date;
  userName: string | null;
  userImage: string | null;
}

export function Comments({ marketId, comments, loggedIn }: { marketId: string; comments: CommentItem[]; loggedIn: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marketId, body }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "שגיאה");
      return;
    }
    gaEvent("comment_post", { market_id: marketId });
    setBody("");
    router.refresh();
  }

  return (
    <section className="card p-3.5 sm:p-5">
      <h2 className="mb-3 font-bold text-text-strong">תגובות ({comments.length})</h2>
      {loggedIn ? (
        <form onSubmit={submit} className="mb-4 flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            enterKeyHint="send"
            placeholder="מה דעתך? למה השוק טועה?"
            className="tap min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base outline-none focus:border-accent sm:text-sm"
          />
          <button
            disabled={busy || !body.trim()}
            className="tap pressable shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-2 disabled:opacity-40"
          >
            שליחה
          </button>
        </form>
      ) : (
        <p className="mb-4 text-sm text-muted">התחברו כדי להגיב.</p>
      )}
      {err && <p className="mb-2 text-sm text-no">{err}</p>}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Avatar name={c.userName} image={c.userImage} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-semibold text-text">{c.userName ?? "אנונימי"}</span>
                <span className="text-muted-2">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-text">{c.body}</p>
            </div>
          </li>
        ))}
        {!comments.length && <li className="text-sm text-muted-2">עדיין אין תגובות. היו הראשונים.</li>}
      </ul>
    </section>
  );
}
