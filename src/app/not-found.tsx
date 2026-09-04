import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-16 max-w-md p-10 text-center">
      <div className="text-6xl">🗳️</div>
      <h1 className="mt-4 text-2xl font-bold text-text-strong">הדף לא נמצא</h1>
      <p className="mt-2 text-muted">אולי השוק הזה עדיין לא נפתח, או שהקישור שגוי.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-2">
        חזרה לשווקים
      </Link>
    </div>
  );
}
