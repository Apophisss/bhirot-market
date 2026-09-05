import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { adminMode, isAdmin } from "@/lib/admin";
import { adminLogout } from "../actions";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ניהול",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const mode = await adminMode();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-strong">לוח הניהול</h1>
          <p className="text-sm text-muted">
            אנליטיקה של האתר, בריאות התוכן, וייצוא נתונים לניתוח.{" "}
            <Link href="/" className="text-accent-2 hover:underline">
              חזרה לאתר
            </Link>
          </p>
        </div>
        {mode === "cookie" && (
          <form action={adminLogout}>
            <button className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:border-border-2 hover:text-no">יציאה מהניהול</button>
          </form>
        )}
      </div>

      {mode === "dev" && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-text">
          מצב פיתוח: לא הוגדרו <code className="rounded bg-surface-2 px-1">ADMIN_TOKEN</code> או{" "}
          <code className="rounded bg-surface-2 px-1">ADMIN_EMAILS</code>, ולכן הלוח פתוח. בפרודקשן הוא חסום אוטומטית.
        </p>
      )}

      <Suspense fallback={null}>
        <AdminNav />
      </Suspense>

      {children}
    </div>
  );
}
