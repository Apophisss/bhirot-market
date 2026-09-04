export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="טוען">
      <div className="h-56 animate-pulse rounded-3xl bg-surface" />
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="flex gap-3">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-surface-2" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
                <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-9 animate-pulse rounded-lg bg-surface-2" />
              <div className="h-9 animate-pulse rounded-lg bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
