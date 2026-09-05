"use client";

import { useState } from "react";
import Link from "next/link";
import { CATEGORIES, getCategory } from "@/lib/categories";
import { MarketImage } from "./MarketImage";
import { ProbabilityGauge } from "./ProbabilityGauge";
import { Field } from "./ContactForm";
import { pct } from "@/lib/format";
import type { CSSProperties } from "react";

/** Two weeks out — a sane default target date for a proposed question. */
function defaultCloseDate(): string {
  return new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
}

export function SuggestQuestionForm({
  loggedIn,
  defaultName,
  defaultEmail,
}: {
  loggedIn: boolean;
  defaultName?: string | null;
  defaultEmail?: string | null;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [resolutionCriteria, setResolutionCriteria] = useState("");
  const [closesAt, setClosesAt] = useState(defaultCloseDate());
  const [probability, setProbability] = useState(50);
  const [imageUrl, setImageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const cat = getCategory(category);
  const ready = title.trim().length >= 10;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        category,
        description,
        resolutionCriteria,
        closesAt,
        probability,
        imageUrl,
        sourceUrl,
        name,
        email,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "השליחה נכשלה. נסו שוב.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="card p-5 text-center sm:p-8">
        <h2 className="text-lg font-extrabold text-text-strong">ההצעה נשלחה לצוות המערכת</h2>
        <p className="mt-2 text-sm text-muted">
          כל הצעה נבדקת ידנית: אם היא ניתנת להכרעה, אינה כפילות ויש לה מועד יעד ברור — היא תעלה ללוח עם מחיר פתיחה.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              setSent(false);
              setTitle("");
              setDescription("");
              setResolutionCriteria("");
              setImageUrl("");
              setSourceUrl("");
            }}
            className="tap pressable rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2"
          >
            להציע שאלה נוספת
          </button>
          <Link href="/" className="tap pressable flex items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-2">
            חזרה ללוח
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card space-y-4 p-4 sm:p-5">
        <Field label="השאלה" required hint="בעברית, מתחילה ב״האם״, נגמרת בסימן שאלה, וכוללת מועד יעד. למשל: ״האם הכנסת תאשר את חוק הגיוס בקריאה ראשונה עד 30.11?״">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={10}
            maxLength={180}
            placeholder="האם …?"
            className="inp"
          />
          <p className="mt-1 text-left text-[11px] text-muted-2">{title.length}/180</p>
        </Field>

        <Field label="קטגוריה">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`pressable rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
                  category === c.id ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="מועד יעד" hint="התאריך שעד אליו השאלה צריכה להיות מוכרעת.">
            <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="inp" />
          </Field>
          <Field label={`ההערכה שלכם: ${probability}% שהתשובה ״כן״`} hint="כמה סביר, לדעתכם, שזה יקרה.">
            <input
              type="range"
              min={1}
              max={99}
              value={probability}
              onChange={(e) => setProbability(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--color-accent)]"
            />
          </Field>
        </div>

        <Field label="רקע" hint="2–4 משפטים עובדתיים שמסבירים למה השאלה רלוונטית עכשיו.">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} className="inp resize-y" />
        </Field>

        <Field label="איך מכריעים" hint="מה ייחשב ״כן״, מה ייחשב ״לא״, ומי המקור המכריע.">
          <textarea
            value={resolutionCriteria}
            onChange={(e) => setResolutionCriteria(e.target.value)}
            maxLength={2000}
            rows={3}
            className="inp resize-y"
            placeholder="״כן״ אם … לפי פרסום ב…; אחרת ״לא״."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="תמונה לשאלה (לא חובה)" hint="קישור https לתמונה, או נתיב באתר כמו /covers/polls.svg.">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} maxLength={500} placeholder="https://…" className="inp" />
          </Field>
          <Field label="קישור למקור (לא חובה)" hint="כתבה שממנה השאלה נובעת.">
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} maxLength={500} placeholder="https://…" className="inp" />
          </Field>
        </div>

        {!loggedIn && (
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="שם (לא חובה)">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="inp" />
            </Field>
            <Field label="אימייל (לא חובה)" hint="רק כדי לעדכן אתכם אם השאלה עלתה ללוח.">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={160} className="inp" />
            </Field>
          </div>
        )}

        {err && <p className="rounded-lg bg-no/10 px-3 py-2 text-sm font-medium text-no">{err}</p>}

        <button
          disabled={busy || !ready}
          className="tap pressable w-full rounded-lg bg-accent px-4 text-sm font-bold text-white hover:bg-accent-2 disabled:opacity-40 sm:w-auto sm:px-8"
        >
          {busy ? "שולח…" : "שליחת ההצעה"}
        </button>
        {!ready && <p className="text-[12px] text-muted-2">כתבו שאלה באורך 10 תווים לפחות כדי לשלוח.</p>}
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="card p-3.5 sm:p-4">
          <h2 className="mb-2 text-[13px] font-bold text-muted">כך זה ייראה בלוח</h2>
          <SuggestionPreview title={title} category={category} imageUrl={imageUrl} probability={probability} />
          <p className="mt-3 text-[11px] leading-relaxed text-muted-2">
            תצוגה מקדימה בלבד. מחיר הפתיחה בפועל, הנזילות והניסוח הסופי נקבעים על ידי צוות המערכת בזמן הפרסום.
          </p>
        </div>
        <div className="card p-3.5 text-[12px] leading-relaxed text-muted sm:p-4">
          <h2 className="mb-1.5 text-[13px] font-bold text-text-strong">מה מתקבל ומה נפסל</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>אירוע ספציפי, עם מועד יעד ומקור פומבי שמכריע אותו.</li>
            <li>לא מתקבלות שאלות על מוות או מחלה של אנשים, ולא שאלות שמעודדות אלימות.</li>
            <li>לא מתקבלות כפילויות של שאלות שכבר קיימות בלוח, גם בניסוח אחר.</li>
            <li>הקטגוריה שנבחרה: <strong className="text-text">{cat.label}</strong>.</li>
          </ul>
        </div>
      </aside>
    </form>
  );
}

/** Small card-shaped preview: the photo, the question and the opening price. */
export function SuggestionPreview({
  title,
  category,
  imageUrl,
  probability,
}: {
  title: string;
  category: string;
  imageUrl?: string;
  probability: number;
}) {
  const cat = getCategory(category);
  const p = Math.min(99, Math.max(1, probability)) / 100;
  return (
    <article className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2.5">
        <MarketImage
          src={imageUrl?.trim() || cat.cover}
          fallback={cat.cover}
          alt=""
          className="h-11 w-11 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <span className="cat-chip rounded-md px-1.5 py-0.5 text-[11px]" style={{ "--cat": cat.accent, "--cat-dark": cat.accentDark } as CSSProperties}>
            {cat.label}
          </span>
          <p className="mt-1 line-clamp-3 text-[14px] font-semibold leading-snug text-text-strong">
            {title.trim() || "האם …?"}
          </p>
        </div>
        <ProbabilityGauge p={p} size={54} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
        <span className="rounded-lg bg-yes/15 py-2 text-center text-yes">כן {pct(p)}</span>
        <span className="rounded-lg bg-no/15 py-2 text-center text-no">לא {pct(1 - p)}</span>
      </div>
    </article>
  );
}
