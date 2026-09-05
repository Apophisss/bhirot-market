"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APPEAL_DEFAULT, APPEAL_LEVELS, appealLevel } from "@/lib/appeal";
import {
  TOPICALITY_DEFAULT,
  TOPICALITY_HALF_LIFE_HOURS,
  TOPICALITY_LEVELS,
  topicalityLevel,
} from "@/lib/topicality";
import { CATEGORIES, getCategory } from "@/lib/categories";
import { Field } from "@/components/ContactForm";
import { MarketImage } from "@/components/MarketImage";
import { ProbabilityGauge } from "@/components/ProbabilityGauge";
import { suggestSlug } from "@/lib/slug";
import { pct } from "@/lib/format";
import type { CSSProperties } from "react";

export interface PersonOption {
  id: string;
  name: string;
  role?: string;
  image?: string;
}

export interface QuestionDraft {
  title?: string;
  subtitle?: string;
  description?: string;
  resolutionCriteria?: string;
  category?: string;
  closesAt?: string;
  probabilityPct?: number;
  imageUrl?: string;
  sourceUrl?: string;
  suggestionId?: number;
  suggestedBy?: string;
}

/** Israel-local "YYYY-MM-DDTHH:mm" a week out, the site's usual 20:59 deadline. */
function defaultCloses(): string {
  const d = new Date(Date.now() + 7 * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T20:59`;
}

export function NewQuestionForm({ people, draft }: { people: PersonOption[]; draft?: QuestionDraft }) {
  const router = useRouter();
  const [title, setTitle] = useState(draft?.title ?? "");
  const [subtitle, setSubtitle] = useState(draft?.subtitle ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [resolutionCriteria, setResolutionCriteria] = useState(draft?.resolutionCriteria ?? "");
  const [category, setCategory] = useState(draft?.category ?? "general");
  const [slug, setSlug] = useState("");
  const [closesAt, setClosesAt] = useState(draft?.closesAt ?? defaultCloses());
  const [probabilityPct, setProbabilityPct] = useState(draft?.probabilityPct ?? 30);
  const [liquidity, setLiquidity] = useState(2000);
  const [appeal, setAppeal] = useState(APPEAL_DEFAULT);
  const [topicality, setTopicality] = useState(TOPICALITY_DEFAULT);
  const [featured, setFeatured] = useState(false);
  const [tags, setTags] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState(draft?.imageUrl ?? "");
  const [sources, setSources] = useState<{ title: string; url: string }[]>(
    draft?.sourceUrl ? [{ title: "מקור", url: draft.sourceUrl }] : [{ title: "", url: "" }],
  );
  const [peopleQuery, setPeopleQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; json: string } | null>(null);

  const cat = getCategory(category);
  const autoSlug = useMemo(() => suggestSlug(title || "market"), [title]);
  const effectiveSlug = slug.trim() || autoSlug;
  const photo = selectedPeople.map((id) => people.find((p) => p.id === id)?.image).find(Boolean);
  const previewImage = imageUrl.trim() || photo || cat.cover;

  const filteredPeople = useMemo(() => {
    const q = peopleQuery.trim();
    const list = q ? people.filter((p) => p.name.includes(q) || p.id.includes(q.toLowerCase())) : people;
    return list.slice(0, 40);
  }, [people, peopleQuery]);

  function togglePerson(id: string) {
    setSelectedPeople((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 6 ? cur : [...cur, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const payload = {
      slug: effectiveSlug,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      description: description.trim(),
      resolutionCriteria: resolutionCriteria.trim(),
      category,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      people: selectedPeople,
      imageUrl: imageUrl.trim() || undefined,
      closesAt,
      probabilityPct,
      liquidity,
      appeal,
      topicality,
      featured,
      sources: sources.filter((s) => s.url.trim()).map((s) => ({ title: s.title.trim() || "מקור", url: s.url.trim() })),
      ...(draft?.suggestionId ? { fromSuggestion: draft.suggestionId } : {}),
    };
    const res = await fetch("/api/admin/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.ok) {
      setErr(data.error ?? "הפרסום נכשל");
      return;
    }
    setDone({ slug: data.slug, json: JSON.stringify(data.market, null, 2) });
    router.refresh();
  }

  if (done) {
    return (
      <div className="card space-y-3 p-4 sm:p-5">
        <h2 className="text-lg font-extrabold text-text-strong">השאלה פורסמה ללוח</h2>
        <p className="text-sm text-muted">
          השוק פתוח למסחר עכשיו:{" "}
          <Link href={`/market/${done.slug}`} className="font-semibold text-accent-2 hover:underline">
            /market/{done.slug}
          </Link>
        </p>
        <div>
          <p className="mb-1 text-[13px] font-semibold text-text-strong">להוסיף גם ל-data/markets.json</p>
          <p className="mb-2 text-[12px] leading-relaxed text-muted">
            השאלה נשמרה במסד הנתונים בלבד. כדי שהיא תשרוד גם הקמה מחדש של המסד, העתיקו את האובייקט הזה אל מערך
            <code className="mx-1 rounded bg-surface-2 px-1">markets</code> בקובץ, ובצעו commit.
          </p>
          <textarea readOnly value={done.json} rows={12} className="inp font-mono text-[12px]" dir="ltr" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setDone(null);
              setTitle("");
              setSubtitle("");
              setDescription("");
              setResolutionCriteria("");
              setSlug("");
              setSelectedPeople([]);
              setImageUrl("");
              setAppeal(APPEAL_DEFAULT);
              setSources([{ title: "", url: "" }]);
            }}
            className="tap pressable rounded-lg bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-2"
          >
            לפרסם שאלה נוספת
          </button>
          <Link
            href={`/market/${done.slug}`}
            className="tap pressable flex items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface-2"
          >
            לצפייה בשוק
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card space-y-4 p-4 sm:p-5">
        {draft?.suggestionId && (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent">
            מבוסס על הצעה #{draft.suggestionId}
            {draft.suggestedBy ? ` מאת ${draft.suggestedBy}` : ""}. עם הפרסום ההצעה תסומן כאושרה.
          </p>
        )}

        <Field label="השאלה" required hint="עברית, מתחילה ב״האם״, נגמרת בסימן שאלה, וכוללת מועד יעד. עד 180 תווים.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={10} maxLength={180} className="inp" placeholder="האם …?" />
          <p className="mt-1 text-left text-[11px] text-muted-2">{title.length}/180</p>
        </Field>

        <Field label="שורת הסבר (לא חובה)" hint="משפט אחד שמסביר את ההקשר. לא מוצג במצב זריז.">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={240} className="inp" />
        </Field>

        <Field label="רקע" required hint="2–4 משפטים עובדתיים עם תאריכים. לפחות 20 תווים.">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={20} maxLength={4000} rows={4} className="inp resize-y" />
        </Field>

        <Field label="כללי הכרעה" required hint="מה נחשב ״כן״, מה ״לא״, מי המקור המכריע ומה קורה אם האירוע לא מתרחש כלל.">
          <textarea
            value={resolutionCriteria}
            onChange={(e) => setResolutionCriteria(e.target.value)}
            required
            minLength={20}
            maxLength={4000}
            rows={4}
            className="inp resize-y"
          />
        </Field>

        <Field label="קטגוריה" required>
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
          <Field label="מועד סגירה" required hint="שעון ישראל. בין שעתיים ל-120 יום מעכשיו.">
            <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} required className="inp" />
          </Field>
          <Field label="מזהה בכתובת (slug)" hint="אנגלית, kebab-case. ריק = ייווצר אוטומטית. לא ניתן לשנות אחרי הפרסום.">
            <input value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={80} placeholder={autoSlug} className="inp font-mono text-[13px]" dir="ltr" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`מחיר פתיחה: ${probabilityPct}% ל״כן״`} required hint="ההערכה הכנה שלכם, לא 50% אוטומטית.">
            <input
              type="range"
              min={2}
              max={98}
              value={probabilityPct}
              onChange={(e) => setProbabilityPct(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--color-accent)]"
            />
          </Field>
          <Field label="נזילות (b)" hint="2000 כברירת מחדל. ערך נמוך = השוק זז מהר יותר. נקבע פעם אחת.">
            <input
              type="number"
              min={200}
              max={100000}
              step={100}
              value={liquidity}
              onChange={(e) => setLiquidity(Number(e.target.value))}
              className="inp"
            />
          </Field>
        </div>

        <Field
          label={`כמה השאלה הזאת מגניבה? ${appealLevel(appeal).label}`}
          required
          hint="הדירוג שלכם כיוצרי השאלה. מנוע ההמלצות מרים שאלה מגניבה ומוריד שאלה טכנית — אז דרגו בכנות, לא הכול 5."
        >
          <div className="flex flex-wrap gap-2">
            {APPEAL_LEVELS.map((level) => (
              <button
                type="button"
                key={level.value}
                onClick={() => setAppeal(level.value)}
                title={level.hint}
                aria-pressed={appeal === level.value}
                className={`pressable rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
                  appeal === level.value ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                {level.value} · {level.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{appealLevel(appeal).hint}</p>
        </Field>

        <Field
          label={`כמה זה אקטואלי עכשיו? ${topicalityLevel(topicality).label}`}
          required
          hint={`נמדד מרגע הפרסום ודועך מעצמו: מחצית מהדחיפה נשארת אחרי ${TOPICALITY_HALF_LIFE_HOURS} שעות, ותוך שבוע היא נגמרת. שאלה שלא תלויה בחדשות של היום — השאירו על 1.`}
        >
          <div className="flex flex-wrap gap-2">
            {TOPICALITY_LEVELS.map((level) => (
              <button
                type="button"
                key={level.value}
                onClick={() => setTopicality(level.value)}
                title={level.hint}
                aria-pressed={topicality === level.value}
                className={`pressable rounded-lg border px-3 py-1.5 text-[13px] font-medium ${
                  topicality === level.value ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                {level.value} · {level.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{topicalityLevel(topicality).hint}</p>
        </Field>

        <Field label="אנשים בשאלה" hint="הראשון שנבחר מספק את תמונת הכרטיס. עד 6.">
          <input
            value={peopleQuery}
            onChange={(e) => setPeopleQuery(e.target.value)}
            placeholder="חיפוש: נתניהו, בנט…"
            className="inp mb-2"
          />
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2">
            {filteredPeople.map((p) => {
              const on = selectedPeople.includes(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => togglePerson(p.id)}
                  title={p.role}
                  className={`pressable flex items-center gap-1.5 rounded-full border px-2 py-1 text-[12px] ${
                    on ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted hover:border-border-2"
                  }`}
                >
                  {p.image && <MarketImage src={p.image} fallback={cat.cover} alt="" className="h-5 w-5 rounded-full object-cover" />}
                  {p.name}
                </button>
              );
            })}
            {!filteredPeople.length && <span className="p-1 text-[12px] text-muted-2">לא נמצא אף אחד בשם הזה.</span>}
          </div>
          {selectedPeople.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">נבחרו: {selectedPeople.join(", ")}</p>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="תמונה (לא חובה)" hint="דורסת את תמונת האדם ואת תמונת הקטגוריה. https:// או נתיב באתר.">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} maxLength={500} placeholder="/covers/polls.svg" className="inp" dir="ltr" />
          </Field>
          <Field label="תגיות (מופרדות בפסיק)">
            <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={300} placeholder="סקרים, ליכוד" className="inp" />
          </Field>
        </div>

        <Field label="מקורות" hint="קישורים אמיתיים לכתבות. אל תמציאו כתובות.">
          <div className="space-y-2">
            {sources.map((s, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <input
                  value={s.title}
                  onChange={(e) => setSources((cur) => cur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  placeholder="כותרת המקור"
                  maxLength={200}
                  className="inp"
                />
                <input
                  value={s.url}
                  onChange={(e) => setSources((cur) => cur.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  placeholder="https://…"
                  maxLength={500}
                  className="inp"
                  dir="ltr"
                />
              </div>
            ))}
          </div>
          {sources.length < 4 && (
            <button
              type="button"
              onClick={() => setSources((cur) => [...cur, { title: "", url: "" }])}
              className="mt-2 text-[13px] font-semibold text-accent-2 hover:underline"
            >
              + מקור נוסף
            </button>
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          להציג את השאלה בראש הלוח (featured)
        </label>

        {err && <p className="rounded-lg bg-no/10 px-3 py-2 text-sm font-medium text-no">{err}</p>}

        <button
          disabled={busy || title.trim().length < 10 || description.trim().length < 20 || resolutionCriteria.trim().length < 20}
          className="tap pressable w-full rounded-lg bg-accent px-4 text-sm font-bold text-white hover:bg-accent-2 disabled:opacity-40 sm:w-auto sm:px-8"
        >
          {busy ? "מפרסם…" : "פרסום השאלה ללוח"}
        </button>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="card p-3.5 sm:p-4">
          <h2 className="mb-2 text-[13px] font-bold text-muted">תצוגה מקדימה</h2>
          <article className="rounded-xl border border-border p-3">
            <div className="flex items-start gap-2.5">
              <MarketImage src={previewImage} fallback={cat.cover} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <span className="cat-chip rounded-md px-1.5 py-0.5 text-[11px]" style={{ "--cat": cat.accent, "--cat-dark": cat.accentDark } as CSSProperties}>
                  {cat.label}
                </span>
                <p className="mt-1 line-clamp-3 text-[14px] font-semibold leading-snug text-text-strong">{title.trim() || "האם …?"}</p>
                {subtitle.trim() && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{subtitle}</p>}
              </div>
              <ProbabilityGauge p={probabilityPct / 100} size={54} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
              <span className="rounded-lg bg-yes/15 py-2 text-center text-yes">כן {pct(probabilityPct / 100)}</span>
              <span className="rounded-lg bg-no/15 py-2 text-center text-no">לא {pct(1 - probabilityPct / 100)}</span>
            </div>
          </article>
          <dl className="mt-3 space-y-1 text-[11px] text-muted">
            <div className="flex justify-between gap-2">
              <dt>כתובת</dt>
              <dd className="truncate font-mono text-text" dir="ltr">/market/{effectiveSlug}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>נזילות</dt>
              <dd className="tabular text-text">{liquidity}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>דירוג היוצר</dt>
              <dd className="text-text">
                <span className="tabular">{appeal}</span> · {appealLevel(appeal).label}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>אקטואליות</dt>
              <dd className="text-text">
                <span className="tabular">{topicality}</span> · {topicalityLevel(topicality).label}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>מקורות</dt>
              <dd className="tabular text-text">{sources.filter((s) => s.url.trim()).length}</dd>
            </div>
          </dl>
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-muted-2">
          הפרסום נכנס למסד הנתונים מיד ופותח מסחר. אחרי הפרסום תקבלו את אובייקט ה-JSON להוספה ל-<code>data/markets.json</code>,
          שהוא מקור האמת של הלוח.
        </p>
      </aside>
    </form>
  );
}
