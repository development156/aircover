import { SkeletonBar, SkeletonCard, SkeletonPageTitle, SkeletonScreen } from '@/components/skeleton'

/**
 * /posts, shaped: a title, the FILTER ROW, then post cards.
 *
 * The filter row is in the skeleton because it is in the page. `SkeletonRows`
 * alone drew a title straight onto a list, so when the real page landed the
 * whole list stepped ~40px down the screen — which is the reflow a skeleton
 * exists to prevent, not a detail.
 *
 * EIGHT TILES IN THE SAME GRID THE PAGE USES, not five stacked rows. The list
 * became a grid of square tiles and this file did not follow, so the skeleton
 * promised full-width rows and the real page arrived as a four-column grid: a
 * whole-page relayout, which is the reflow a skeleton exists to prevent. Eight
 * because that is what the page shows before its fold, and the grid and the
 * ratio are written with the same classes for the same reason — `narrow` and
 * `wide` are this app's only breakpoints, and the square starts where the grid
 * is four wide.
 *
 * The card shape mirrors the real one — title line, two excerpt lines, a chip
 * row — rather than a grey block, so the placeholder says WHAT is coming and
 * not merely that something is.
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
      <div className="grid gap-grid grid-cols-1 narrow:grid-cols-2 wide:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonCard key={i} className="space-y-2 p-4 wide:aspect-square">
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
