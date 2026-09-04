import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center sm:mt-16 sm:p-10">
      <div className="tabular text-sm font-semibold text-muted-2">404</div>
      <h1 className="mt-2 text-2xl font-bold text-text-strong">הדף לא נמצא</h1>
      <p className="mt-2 text-muted">אולי השוק הזה עדיין לא נפתח, או שהקישור שגוי.</p>
      <Link
        href="/"
        className="tap pressable mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-2"
      >
        חזרה לשווקים
      </Link>
    </div>
  );
}
