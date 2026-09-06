/**
 * The placeholder the home board streams behind.
 *
 * Every box here is measured against the thing it stands in for, at 390px in a phone
 * profile, because a skeleton that is the wrong height is not a placeholder — it is a
 * layout shift with a nice animation. The hero really measures 328px at 390 and 414,
 * 349 at 360, 464 between 640 and 700, 443 up to about 900, and 328 again from `lg`,
 * where the pitch and the sidebar sit side by side; the old `h-64 sm:h-56` reserved 256
 * and 224, so everything below it dropped by 72px the moment the real content landed.
 * The heading and the one-line strapline above the first grid were not reserved at all,
 * which cost another 87px.
 *
 * The card is `MarketCard`'s own box: 14px of padding, a 44px face beside a chip and
 * three clamped title lines, the two answer buttons, and the footer that carries the
 * counters — 222px against a measured median of 233.
 *
 * Since `src/lib/board-cache.ts` landed, a warm home render is a few milliseconds and
 * this is rarely on screen at all. It still is on a cold cache and on every client-side
 * navigation back to the board, which is exactly when a reader is looking at it.
 */
export default function Loading() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-busy="true" aria-label="טוען">
      <div className="h-[328px] animate-pulse rounded-2xl bg-surface-2 sm:h-[452px] sm:rounded-3xl lg:h-[328px]" />
      <div className="space-y-3">
        {/* the section heading and its one line of explanation, both of which the real
            board carries above every grid it draws */}
        <div className="h-9 w-52 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-[39px] w-full animate-pulse rounded bg-surface-2 sm:h-11 md:h-[22px]" />
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card flex flex-col gap-3 p-3.5 sm:p-4">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-surface-3" />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="h-4 w-24 animate-pulse rounded bg-surface-3" />
                  <div className="h-5 w-full animate-pulse rounded bg-surface-3" />
                  <div className="h-5 w-full animate-pulse rounded bg-surface-3" />
                  <div className="h-5 w-2/3 animate-pulse rounded bg-surface-3" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-11 animate-pulse rounded-lg bg-surface-3" />
                <div className="h-11 animate-pulse rounded-lg bg-surface-3" />
              </div>
              <div className="h-5 w-1/2 animate-pulse rounded bg-surface-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
