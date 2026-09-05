import { SITE_NAME } from "@/lib/config";
import { RETENTION_DAYS, analyticsSize } from "@/lib/analytics";
import { getIssues, range } from "@/lib/stats";
import { Card, fmt } from "@/components/admin/Charts";
import { BundlePanel } from "@/components/admin/BundlePanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "באנדל נתונים" };

const CONTENTS: { key: string; what: string }[] = [
  { key: "issues", what: "רשימת הבעיות שהאתר זיהה בעצמו, לפי חומרה, עם הקובץ שבו מתקנים" },
  { key: "summary + funnel", what: "מספרים ראשיים ומשפך מלא: מבקר → עמוד שוק → ניסיון עסקה → הרשמה → עסקה → עסקה שנייה" },
  { key: "traffic", what: "סדרות יומיות, עמודים, מקורות, קמפיינים, מכשירים, מדינות ושעות היום" },
  { key: "engagement", what: "כל האירועים, הלחיצות על אלמנטים מסומנים והחיפושים" },
  { key: "business", what: "הרשמות, עסקאות, נפח ותגובות ליום + פילוח מסחר" },
  { key: "markets", what: "כל שוק עם צפיות, מבקרים, עסקאות, נפח והמרה + ביצועי קטגוריות + כיול מחירים (Brier)" },
  { key: "users", what: "סטטיסטיקות מצטברות וקוהורטות הרשמה — בלי שמות, אימיילים או מזהים" },
  { key: "performance", what: "Core Web Vitals מהשדה, העמודים האיטיים ושגיאות דפדפן" },
  { key: "editorial", what: "ריצות רוטינת העדכון השעתית" },
  { key: "guide", what: "מילון מונחים, קטלוג האירועים ומפת הקוד — כדי שסוכן יבין את הנתונים בלי הסברים נוספים" },
];

export default async function AdminBundle() {
  const [size, issues] = await Promise.all([analyticsSize(), getIssues(range(30))]);

  return (
    <div className="space-y-5">
      <Card title="באנדל נתונים לניתוח" hint="קובץ אחד עם כל מה שידוע על האתר — מיועד להעברה לסוכן שינתח וישפר">
        <BundlePanel site={SITE_NAME} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="מה יש בקובץ">
          <ul className="space-y-2 text-sm">
            {CONTENTS.map((c) => (
              <li key={c.key} className="flex gap-2">
                <code className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-accent-2" dir="ltr">
                  {c.key}
                </code>
                <span className="text-muted">{c.what}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="מצב המעקב">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">אירועים שמורים</dt>
                <dd className="tabular font-semibold text-text">{fmt(size.events)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">האירוע הישן ביותר</dt>
                <dd className="text-text">{size.oldest ? size.oldest.toLocaleDateString("he-IL") : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">שמירת נתונים</dt>
                <dd className="tabular text-text">{RETENTION_DAYS} ימים</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">בעיות פתוחות (30 יום)</dt>
                <dd className={`tabular font-semibold ${issues.length ? "text-warn" : "text-yes"}`}>{issues.length}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-2">
              הבאנדל לא מכיל שמות, אימיילים, כתובות IP או מזהי משתמש — רק נתונים צבירים ותוכן ציבורי של השווקים.
            </p>
          </Card>

          <Card title="משיכה מהטרמינל" hint="אותו קובץ, בלי הדפדפן">
            <pre className="overflow-x-auto rounded-xl border border-border bg-surface-2 p-3 text-xs leading-relaxed" dir="ltr">
              {`# מהריפו, עם SITE_URL ו-ADMIN_TOKEN בסביבה:
npm run bundle

# או ישירות:
curl -H "Authorization: Bearer $ADMIN_TOKEN" \\
  "$SITE_URL/api/admin/bundle?days=90" -o bundle.json`}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}
