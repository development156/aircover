import { SkeletonBar, SkeletonCard, SkeletonPageTitle, SkeletonScreen } from '@/components/skeleton'

/**
 * /analytics, shaped: the four-slot performance strip, the account panel, then
 * the 1fr/340px split the page actually uses.
 *
 * The split is in the skeleton because it is in the page. A stack of equal
 * blocks would let the right-hand card jump into a column that was not there a
 * moment ago, which is the reflow a skeleton exists to prevent.
 *
 * Shapes only, never text — a skeleton carrying a number is a claim about the
 * user's data made before the read returned, and this is the page where that
 * would matter most.
 */
export default function AnalyticsLoading() {
  return (
    <SkeletonScreen label="Loading your analytics">
      <SkeletonPageTitle withSub={false} />

      <SkeletonCard className="space-y-3">
        <SkeletonBar className="h-4 w-[120px]" />
        <div className="grid grid-cols-4 gap-4 max-wide:grid-cols-2">
          <SkeletonBar className="h-8" />
          <SkeletonBar className="h-8" />
          <SkeletonBar className="h-8" />
          <SkeletonBar className="h-8" />
        </div>
      </SkeletonCard>

      <SkeletonCard className="space-y-2">
        <SkeletonBar className="h-3 w-[140px]" />
        <SkeletonBar className="h-[13px] w-[60%] opacity-70" />
        <SkeletonBar className="h-[13px] w-[40%] opacity-70" />
      </SkeletonCard>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-grid max-wide:grid-cols-1">
        <SkeletonCard className="h-[196px]" />
        <SkeletonCard className="h-[140px]" />
      </div>
    </SkeletonScreen>
  )
}
