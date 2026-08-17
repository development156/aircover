import { SkeletonBar, SkeletonCard, SkeletonScreen } from '@/components/skeleton'

/**
 * /home, shaped: the greeting strip, then the Performance card, then the two
 * columns the page actually uses. The greeting is 190px because that is the real
 * banner height — a shorter placeholder would let the whole page jump upward the
 * moment the data lands, which is the reflow a skeleton exists to prevent.
 */
export default function HomeLoading() {
  return (
    <SkeletonScreen label="Loading your home screen">
      <SkeletonCard className="min-h-[190px] max-narrow:min-h-[150px]" />
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-grid max-wide:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-grid">
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
          <SkeletonCard className="h-[140px]" />
        </div>
      </div>
    </SkeletonScreen>
  )
}
