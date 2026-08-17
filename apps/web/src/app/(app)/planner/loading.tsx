import { SkeletonCard, SkeletonPageTitle, SkeletonScreen } from '@/components/skeleton'

/**
 * /planner leads with the view toggle and then a grid or a list. The tall block
 * stands in for whichever view is active — matching all three exactly would need
 * the searchParam, and a 420px card is the right height for every one of them.
 */
export default function PlannerLoading() {
  return (
    <SkeletonScreen label="Loading your planner">
      <SkeletonPageTitle />
      <SkeletonCard className="h-[132px]" />
      <SkeletonCard className="h-[420px]" />
    </SkeletonScreen>
  )
}
