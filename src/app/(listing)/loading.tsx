export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-busy="true" aria-label="טוען">
      <div className="h-64 animate-pulse rounded-2xl bg-surface-2 sm:h-56 sm:rounded-3xl" />
      <div className="scrollbar-none flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-surface-2" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-3.5 sm:p-4">
            <div className="flex gap-3">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-surface-3" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-surface-3" />
                <div className="h-4 w-full animate-pulse rounded bg-surface-3" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-surface-3" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-11 animate-pulse rounded-lg bg-surface-3" />
              <div className="h-11 animate-pulse rounded-lg bg-surface-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
