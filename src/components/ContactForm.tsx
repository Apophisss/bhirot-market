"use client";

import { useState } from "react";
import Link from "next/link";
import { CONTACT_TOPICS } from "@/lib/inbox-topics";

export function ContactForm({ defaultName, defaultEmail }: { defaultName?: string | null; defaultEmail?: string | null }) {
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [topic, setTopic] = useState<string>("question");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, topic, subject, body }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "השליחה נכשלה. נסו שוב.");
      return;
    }
    setSent(true);
    setSubject("");
    setBody("");
  }

  if (sent) {
    return (
      <div className="card p-5 text-center sm:p-8">
        <h2 className="text-lg font-extrabold text-text-strong">ההודעה נשלחה</h2>
        <p className="mt-2 text-sm text-muted">
          תודה. צוות המערכת קורא כל הודעה, ואם השארתם אימייל נחזור אליכם דרכו.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={() => setSent(false)} className="tap pressable rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2">
            לשלוח עוד הודעה
          </button>
          <Link href="/" className="tap pressable flex items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-2">
            חזרה ללוח
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="שם (לא חובה)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="איך לפנות אליכם"
            className="inp"
          />
        </Field>
        <Field label="אימייל" required>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            maxLength={160}
            placeholder="you@example.com"
            className="inp"
          />
        </Field>
      </div>

      <Field label="נושא">
        <div className="flex flex-wrap gap-2">
          {CONTACT_TOPICS.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTopic(t.id)}
              className={`pressable rounded-lg border px-3 py-2 text-sm font-medium ${
                topic === t.id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="כותרת" required>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={120}
          className="tap w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base outline-none focus:border-accent sm:text-sm"
          placeholder="במשפט אחד — על מה הפנייה"
        />
      </Field>

      <Field label="ההודעה" required>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={10}
          maxLength={4000}
          rows={7}
          placeholder="מה רציתם לספר לנו? אם זה נוגע לשוק מסוים — צרפו את הקישור אליו."
          className="inp resize-y"
        />
        <p className="mt-1 text-left text-[13px] text-muted-2">{body.length}/4000</p>
      </Field>

      {err && <p className="rounded-lg bg-no/10 px-3 py-2 text-sm font-medium text-no">{err}</p>}

      <button
        disabled={busy || body.trim().length < 10 || !email}
        className="tap pressable w-full rounded-lg bg-accent px-4 text-sm font-bold text-white hover:bg-accent-2 disabled:opacity-40 sm:w-auto sm:px-8"
      >
        {busy ? "שולח…" : "שליחה"}
      </button>
    </form>
  );
}

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-text-strong">
        {label}
        {required && <span className="text-no"> *</span>}
      </span>
      {hint && <span className="mb-1.5 block text-[13px] leading-snug text-muted">{hint}</span>}
      {children}
    </label>
  );
}
