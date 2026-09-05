/** One numbered block of a policy page — same card rhythm the /about page uses. */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-3 p-4 text-[15px] leading-relaxed text-text sm:p-5">
      <h2 className="text-lg font-bold text-text-strong">{title}</h2>
      {children}
    </section>
  );
}
