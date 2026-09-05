import Link from "next/link";
import { redirect } from "next/navigation";
import { adminLogin } from "../actions";
import { adminEmails, adminTokenConfigured, isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "כניסת ניהול", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (await isAdmin()) redirect("/admin");
  const configured = adminTokenConfigured();
  const emails = adminEmails();

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-8">
        <h1 className="text-2xl font-extrabold text-text-strong">כניסת ניהול</h1>
        <p className="mt-1 text-sm text-muted">עמוד הסטטיסטיקות של האתר. הכניסה עם ה־ADMIN_TOKEN של הפרויקט.</p>

        {error && <p className="mt-4 rounded-lg border border-no/40 bg-no/10 px-3 py-2 text-sm text-no">הטוקן שגוי. נסו שוב.</p>}

        {configured ? (
          <form action={adminLogin} className="mt-6 space-y-3">
            <input
              type="password"
              name="token"
              required
              autoComplete="off"
              placeholder="ADMIN_TOKEN"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm outline-none focus:border-accent"
            />
            <button className="w-full rounded-xl bg-accent px-4 py-3 font-bold text-white hover:bg-accent-2">כניסה</button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-text">
            <strong>לא הוגדר ADMIN_TOKEN.</strong>
            <p className="mt-1 text-muted">
              הוסיפו <code className="rounded bg-surface-2 px-1">ADMIN_TOKEN</code> לסביבה (ראו <code className="rounded bg-surface-2 px-1">.env.example</code>).
              בפיתוח מקומי, כשאין טוקן ואין <code className="rounded bg-surface-2 px-1">ADMIN_EMAILS</code>, עמוד הניהול פתוח ממילא.
            </p>
          </div>
        )}

        {emails.length > 0 && (
          <p className="mt-4 text-xs text-muted-2">
            אפשר גם פשוט להתחבר עם Google בחשבון שמופיע ב־ADMIN_EMAILS ואז לגשת ל־<Link href="/admin" className="text-accent-2 hover:underline">/admin</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
