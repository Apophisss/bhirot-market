"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { fmtDate, pct, timeAgo } from "@/lib/format";
import { getCategory } from "@/lib/categories";
import { contactTopicLabel } from "@/lib/inbox-topics";

export interface MessageItem {
  id: number;
  name: string;
  email: string;
  topic: string;
  body: string;
  status: string;
  adminNote: string | null;
  createdAt: string | Date;
  userName: string | null;
  userImage: string | null;
}

export interface SuggestionItem {
  id: number;
  name: string;
  email: string;
  title: string;
  description: string;
  resolutionCriteria: string;
  category: string;
  imageUrl: string | null;
  probability: number | null;
  sourceUrl: string | null;
  closesAt: string | Date | null;
  status: string;
  adminNote: string | null;
  publishedSlug: string | null;
  createdAt: string | Date;
  userName: string | null;
  userImage: string | null;
}

const MESSAGE_STATES = [
  { id: "new", label: "חדש" },
  { id: "open", label: "בטיפול" },
  { id: "done", label: "טופל" },
] as const;

const SUGGESTION_STATES = [
  { id: "pending", label: "ממתינה" },
  { id: "approved", label: "אושרה" },
  { id: "rejected", label: "נדחתה" },
] as const;

function useInboxPatch(kind: "message" | "suggestion") {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id);
    setErr(null);
    const res = await fetch("/api/admin/inbox", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id, ...body }),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "העדכון נכשל");
      return;
    }
    router.refresh();
  }

  return { patch, busy, err };
}

function StatusButtons({
  states,
  current,
  disabled,
  onPick,
}: {
  states: readonly { id: string; label: string }[];
  current: string;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {states.map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s.id)}
          className={`pressable rounded-lg border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50 ${
            current === s.id ? "border-accent bg-accent text-white" : "border-border text-muted hover:bg-surface-2"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function NoteBox({ value, disabled, onSave }: { value: string | null; disabled: boolean; onSave: (v: string) => void }) {
  const [note, setNote] = useState(value ?? "");
  const dirty = note !== (value ?? "");
  return (
    <div className="flex gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        placeholder="הערה פנימית"
        className="inp min-h-9 flex-1 py-1.5 text-[13px]"
      />
      {dirty && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(note)}
          className="pressable shrink-0 rounded-lg bg-accent px-3 text-[13px] font-semibold text-white hover:bg-accent-2 disabled:opacity-50"
        >
          שמירה
        </button>
      )}
    </div>
  );
}

export function MessagesPanel({ items }: { items: MessageItem[] }) {
  const { patch, busy, err } = useInboxPatch("message");
  const [filter, setFilter] = useState<string>("all");
  const shown = filter === "all" ? items : items.filter((m) => m.status === filter);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: `הכול (${items.length})` },
            ...MESSAGE_STATES.map((s) => ({ id: s.id, label: `${s.label} (${items.filter((m) => m.status === s.id).length})` })),
          ]}
        />
      </div>
      {err && <p className="rounded-lg bg-no/10 px-3 py-2 text-sm text-no">{err}</p>}
      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((m) => (
            <li key={m.id} className="card space-y-2.5 p-3.5 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Avatar name={m.userName ?? m.name} image={m.userImage} size={28} />
                <span className="font-semibold text-text-strong">{m.name || m.userName || "אנונימי"}</span>
                {m.email && (
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent("בחירות מרקט — תשובה לפנייתך")}`} className="text-[12px] text-accent-2 hover:underline" dir="ltr">
                    {m.email}
                  </a>
                )}
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">{contactTopicLabel(m.topic)}</span>
                <span className="text-[11px] text-muted-2">{timeAgo(m.createdAt)}</span>
                {m.userName === null && !m.email && <span className="text-[11px] text-muted-2">(ללא פרטי קשר)</span>}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-text">{m.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusButtons states={MESSAGE_STATES} current={m.status} disabled={busy === m.id} onPick={(status) => patch(m.id, { status })} />
              </div>
              <NoteBox value={m.adminNote} disabled={busy === m.id} onSave={(adminNote) => patch(m.id, { adminNote })} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="card p-8 text-center text-sm text-muted">אין הודעות בסינון הזה.</p>
      )}
    </section>
  );
}

export function SuggestionsPanel({ items }: { items: SuggestionItem[] }) {
  const { patch, busy, err } = useInboxPatch("suggestion");
  const [filter, setFilter] = useState<string>("pending");
  const shown = filter === "all" ? items : items.filter((s) => s.status === filter);

  return (
    <section className="space-y-3">
      <FilterTabs
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: `הכול (${items.length})` },
          ...SUGGESTION_STATES.map((s) => ({ id: s.id, label: `${s.label} (${items.filter((x) => x.status === s.id).length})` })),
        ]}
      />
      {err && <p className="rounded-lg bg-no/10 px-3 py-2 text-sm text-no">{err}</p>}
      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((s) => (
            <li key={s.id} className="card space-y-2.5 p-3.5 sm:p-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-2">
                <Avatar name={s.userName ?? s.name} image={s.userImage} size={24} />
                <span className="text-[13px] font-semibold text-text">{s.name || s.userName || "אנונימי"}</span>
                {s.email && <span dir="ltr">{s.email}</span>}
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-medium text-muted">{getCategory(s.category).label}</span>
                <span>{timeAgo(s.createdAt)}</span>
                {s.closesAt && <span>מועד יעד: {fmtDate(s.closesAt)}</span>}
                {s.probability !== null && <span>הערכת המציע: {pct(s.probability)}</span>}
              </div>

              <p className="text-[15px] font-semibold leading-snug text-text-strong">{s.title}</p>
              {s.description && <p className="whitespace-pre-wrap text-[13px] text-text">{s.description}</p>}
              {s.resolutionCriteria && (
                <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-2 text-[12px] text-muted">
                  <strong className="text-text">הכרעה: </strong>
                  {s.resolutionCriteria}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                {s.sourceUrl && (
                  <a href={s.sourceUrl} target="_blank" rel="noreferrer nofollow" className="text-accent-2 hover:underline" dir="ltr">
                    מקור ↗
                  </a>
                )}
                {s.imageUrl && (
                  <a href={s.imageUrl} target="_blank" rel="noreferrer nofollow" className="text-accent-2 hover:underline" dir="ltr">
                    תמונה ↗
                  </a>
                )}
                {s.publishedSlug && (
                  <Link href={`/market/${s.publishedSlug}`} className="font-semibold text-yes hover:underline">
                    פורסמה כשוק ↗
                  </Link>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusButtons states={SUGGESTION_STATES} current={s.status} disabled={busy === s.id} onPick={(status) => patch(s.id, { status })} />
                {!s.publishedSlug && (
                  <Link
                    href={`/admin?tab=new&suggestion=${s.id}`}
                    className="pressable rounded-lg bg-yes px-3 py-1 text-[12px] font-semibold text-white hover:bg-yes-2"
                  >
                    פרסום כשאלה
                  </Link>
                )}
              </div>
              <NoteBox value={s.adminNote} disabled={busy === s.id} onSave={(adminNote) => patch(s.id, { adminNote })} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="card p-8 text-center text-sm text-muted">אין הצעות בסינון הזה.</p>
      )}
    </section>
  );
}

function FilterTabs({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`pressable rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
            value === o.id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
