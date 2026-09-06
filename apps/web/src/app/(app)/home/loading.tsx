import { SkeletonBar, SkeletonCard, SkeletonScreen } from '@/components/skeleton'

/**
 * /home, shaped.
 *
 * ── THE SKELETON MIRRORS THE PAGE IT PRECEDES, AND THAT IS ITS WHOLE JOB ─────
 * A skeleton's job is that the page does not visibly move when the data lands,
 * so it has to track the layout it stands in for. This one had drifted twice:
 * it still held a 190px greeting band the 08-23 rebuild removed, and a queue
 * inside the left column that the 08-30 rebuild moved to full width, with no
 * board at all. MEASURED 2026-09-06: CLS on arrival was 0.006 only because the
 * stream is fast enough that the skeleton is barely seen; on a slow connection
 * every one of those placeholders sat where nothing was coming.
 *
 * The order is the page's: greeting row · four-cell board · the queue at full
 * width · the split, report left and rail right. Same grid classes, same gaps,
 * same widths, so the swap is a fill and not a jump.
 *
 * These are SHAPES, never text. A skeleton carrying a number or a label is a
 * claim about the user's data made before the read returned.
 */
export default function HomeLoading() {
  return (
    <SkeletonScreen label="Loading your home screen">
      <div className="space-y-6 max-narrow:space-y-5">
        {/* The greeting row: an h1-height bar, a state line, and the primary
            action opposite. */}
        <div className="flex items-center gap-4">
          <div className="space-y-2">
            <SkeletonBar className="h-[30px] w-[164px]" />
            <SkeletonBar className="h-[13px] w-[220px] opacity-70" />
          </div>
          <SkeletonBar className="ml-auto h-[38px] w-[121px] rounded-md max-narrow:hidden" />
        </div>

        {/* The board: one divided card, four cells, the same grid the real one
            uses so the seams land where the seams will be. */}
        <div className="surface-ring grid grid-cols-4 gap-px overflow-hidden rounded-card bg-line-soft max-wide:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-3 bg-surface p-5 max-narrow:p-4">
              <SkeletonBar className="h-[14px] w-[96px]" />
              <SkeletonBar className="h-[44px] w-[72px]" />
              <SkeletonBar className="h-[12px] w-[140px] opacity-70" />
            </div>
          ))}
        </div>

        {/* The queue, full width: a header and one row of the sentence it
            renders when nothing is waiting. */}
        <SkeletonCard className="space-y-3 p-5">
          <SkeletonBar className="h-[18px] w-[160px]" />
          <SkeletonBar className="h-[14px] w-[60%]" />
        </SkeletonCard>

        <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6 max-wide:grid-cols-1 max-narrow:gap-5">
          <div className="flex min-w-0 flex-col gap-6 max-narrow:gap-5">
            {/* Performance: a heading and one line. */}
            <SkeletonCard className="space-y-3 p-5">
              <SkeletonBar className="h-[18px] w-[110px]" />
              <SkeletonBar className="h-[16px] w-[70%]" />
            </SkeletonCard>
            {/* Credits spent: heading, the figure, one sentence. */}
            <SkeletonCard className="space-y-4 p-5">
              <SkeletonBar className="h-[18px] w-[120px]" />
              <SkeletonBar className="h-[44px] w-[64px]" />
              <SkeletonBar className="h-[14px] w-[65%]" />
            </SkeletonCard>
            {/* The week: heading, then seven cells. */}
            <SkeletonCard className="space-y-4 p-5">
              <SkeletonBar className="h-[18px] w-[84px]" />
              <div className="grid grid-cols-7 gap-2.5 max-narrow:grid-cols-1 max-narrow:gap-2">
                {Array.from({ length: 7 }, (_, i) => (
                  <SkeletonBar
                    key={i}
                    className="h-[116px] rounded-card opacity-60 max-narrow:h-[36px]"
                  />
                ))}
              </div>
            </SkeletonCard>
          </div>
          <div className="grid grid-cols-1 items-start gap-6 narrow:grid-cols-2 wide:grid-cols-1 max-narrow:gap-5">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} className="space-y-3 p-5">
                <SkeletonBar className="h-[18px] w-[120px]" />
                <SkeletonBar className="h-[14px] w-[80%] opacity-70" />
                <SkeletonBar className="h-[14px] w-[55%] opacity-70" />
              </SkeletonCard>
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  )
}
