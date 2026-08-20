import { SkeletonBar, SkeletonCard, SkeletonPageTitle, SkeletonScreen } from '@/components/skeleton'

/**
 * /posts, shaped: a title, the FILTER ROW, then post cards.
 *
 * The filter row is in the skeleton because it is in the page. `SkeletonRows`
 * alone drew a title straight onto a list, so when the real page landed the
 * whole list stepped ~40px down the screen — which is the reflow a skeleton
 * exists to prevent, not a detail.
 *
 * Five rows: the list is capped and a new workspace typically has a handful, so
 * five is the honest middle. The card shape mirrors the real one — title line,
 * two excerpt lines, a chip row — rather than a grey block, so the placeholder
 * says WHAT is coming and not merely that something is.
 */
export default function PostsLoading() {
  return (
    <SkeletonScreen label="Loading your posts">
      <SkeletonPageTitle />
      <div className="flex gap-2">
        {[64, 88, 84, 82, 68].map((w, i) => (
          <SkeletonBar key={i} className="h-[30px] rounded-pill" style={{ width: w }} />
        ))}
      </div>
      <div className="space-y-grid">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonCard key={i} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBar className="h-[15px] w-[46%]" />
              <SkeletonBar className="h-[18px] w-[76px] rounded-pill opacity-70" />
            </div>
            <SkeletonBar className="h-[13px] w-full opacity-70" />
            <SkeletonBar className="h-[13px] w-[72%] opacity-70" />
            <SkeletonBar className="h-[17px] w-[120px] rounded-pill opacity-70" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonScreen>
  )
}
