import { SkeletonBar, SkeletonCard, SkeletonPageTitle, SkeletonScreen } from '@/components/skeleton'

/** /analytics is a stat row over a chart. The four tiles are the four slots the
 *  real card renders, so the row does not resize when the numbers arrive. */
export default function AnalyticsLoading() {
  return (
    <SkeletonScreen label="Loading your analytics">
      <SkeletonPageTitle />
      <SkeletonCard className="space-y-4">
        <SkeletonBar className="h-4 w-[140px]" />
        <div className="grid grid-cols-4 gap-4 max-narrow:grid-cols-2">
          <SkeletonBar className="h-10" />
          <SkeletonBar className="h-10" />
          <SkeletonBar className="h-10" />
          <SkeletonBar className="h-10" />
        </div>
        <SkeletonBar className="h-[180px]" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}
