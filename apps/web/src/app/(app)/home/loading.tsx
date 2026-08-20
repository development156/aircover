import { SkeletonBar, SkeletonCard, SkeletonScreen } from '@/components/skeleton'

/**
 * /home, shaped.
 *
 * The greeting strip, then the ATTENTION QUEUE, then the rest. That order is
 * not cosmetic: as of the 2026-08-20 restructure the queue leads the left
 * column, and a skeleton that still mirrors the old order (metrics first) would
 * put a placeholder where nothing is coming and leave the real lead to appear
 * somewhere the eye was not. A skeleton's whole job is that the page does not
 * visibly move when the data lands, so it has to track the layout it precedes.
 *
 * 190px on the greeting is the real banner height, for the same reason.
 *
 * These are SHAPES, never text. A skeleton carrying a number or a label is a
 * claim about the user's data made before the read returned.
 */
export default function HomeLoading() {
  return (
    <SkeletonScreen label="Loading your home screen">
      <SkeletonCard className="min-h-[190px] max-narrow:min-h-[150px]" />
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-grid max-wide:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-grid">
          {/* The queue: a header rule, then two post cards side by side —
              the shape `NeedsAttention` renders when something is waiting. */}
          <SkeletonCard className="space-y-3 p-0">
            <div className="flex min-h-[46px] items-center border-b border-line-soft px-4">
              <SkeletonBar className="h-4 w-[150px]" />
            </div>
            <div className="grid gap-3 p-4 pt-1 wide:grid-cols-2">
              <SkeletonBar className="h-[76px] rounded-[8px]" />
              <SkeletonBar className="h-[76px] rounded-[8px]" />
            </div>
          </SkeletonCard>

          {/* The four-slot performance strip. */}
          <SkeletonCard className="space-y-3">
            <SkeletonBar className="h-4 w-[120px]" />
            <div className="grid grid-cols-2 gap-4">
              <SkeletonBar className="h-8" />
              <SkeletonBar className="h-8" />
              <SkeletonBar className="h-8" />
              <SkeletonBar className="h-8" />
            </div>
          </SkeletonCard>
          <SkeletonCard className="h-[160px]" />
        </div>
        <div className="flex flex-col gap-grid">
          <SkeletonCard className="h-[200px]" />
          {/* The balance card, at its DEMOTED height — it is a type-h2 stat
              now, not a type-display hero, so the placeholder is shorter. */}
          <SkeletonCard className="space-y-2">
            <SkeletonBar className="h-3 w-[110px]" />
            <SkeletonBar className="h-6 w-[84px]" />
            <SkeletonBar className="h-3 w-[130px] opacity-70" />
          </SkeletonCard>
          <SkeletonCard className="h-[140px]" />
        </div>
      </div>
    </SkeletonScreen>
  )
}
