"use client";

import { useState } from "react";

const DAY_OPTIONS = [7, 30, 90, 365];

/** The prompt to paste next to the downloaded file. */
function promptFor(days: number, site: string) {
  return `צירפתי קובץ JSON עם כל נתוני האתר "${site}" (${days} הימים האחרונים) — תנועה, משפך המרה, מעורבות לכל שוק, ביצועים, שגיאות ואיכות ההכרעות.
זה הריפו של האתר (Next.js App Router + SQLite/Drizzle + Tailwind).

1. קרא את guide.repoMap כדי להבין איפה כל דבר יושב בקוד.
2. עבור על issues[] — זו רשימת הבעיות שהאתר זיהה על עצמו — והצלב אותן מול funnel, traffic.pages ו-markets.byMarket.
3. תן לי 3–5 שינויים קונקרטיים, ממוינים לפי (השפעה צפויה / מאמץ), כשלכל אחד: הקובץ המדויק לשינוי, מה בדיוק לשנות, ואיזה מדד בבאנדל אמור לזוז.
4. אחרי שנסכים — תממש אותם.

אל תמציא נתונים שאינם בקובץ, וציין במפורש כשמדגם קטן מדי כדי להסיק ממנו.`;
}

export function BundlePanel({ site }: { site: string }) {
  const [days, setDays] = useState(90);
  const [copied, setCopied] = useState(false);
  const prompt = promptFor(days, site);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">טווח הנתונים:</span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              d === days ? "bg-accent text-white" : "border border-border bg-surface-2 text-muted hover:border-border-2 hover:text-text-strong"
            }`}
          >
            {d === 365 ? "שנה" : `${d} יום`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/admin/bundle?days=${days}&format=json`}
          data-evt="bundle-json"
          className="rounded-xl bg-accent px-5 py-2.5 font-bold text-white shadow-md shadow-accent/25 hover:bg-accent-2"
        >
          ⬇️ הורדת הבאנדל (JSON)
        </a>
        <a
          href={`/api/admin/bundle?days=${days}&format=md`}
          data-evt="bundle-md"
          className="rounded-xl border border-border-2 bg-surface px-5 py-2.5 font-semibold text-text hover:bg-surface-2"
        >
          ⬇️ דוח קריא (Markdown)
        </a>
        <a
          href={`/api/admin/bundle?days=${days}&format=json&download=0`}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-border bg-surface px-5 py-2.5 font-semibold text-muted hover:text-text-strong"
        >
          תצוגה בדפדפן
        </a>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">הפרומפט להעתקה יחד עם הקובץ</h3>
          <button onClick={copy} className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-muted hover:border-border-2 hover:text-text-strong">
            {copied ? "הועתק ✓" : "העתקה"}
          </button>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-2 p-3 text-xs leading-relaxed text-text">
          {prompt}
        </pre>
      </div>
    </div>
  );
}
