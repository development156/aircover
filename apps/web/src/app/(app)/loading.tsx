import {
  SkeletonCard,
  SkeletonPageTitle,
  SkeletonRows,
  SkeletonScreen,
} from '@/components/skeleton'

/**
 * The fallback every app route inherits.
 *
 * Placed on the GROUP rather than per page so no route can ever be bare: a new
 * segment added tomorrow gets a loading state for free, which is exactly how the
 * app came to have none at all — 22 segments, not one `loading.tsx`, because
 * each was somebody's job and therefore nobody's.
 *
 * Routes whose shape is worth matching more closely override this with their own
 * `loading.tsx` (see /home, /posts, /planner, /analytics). This one is the floor,
 * not the ceiling: a title, a wide block and a few rows, which is the shape most
 * screens in this app share.
 */
export default function AppLoading() {
  return (
    <SkeletonScreen label="Loading this page">
      <SkeletonPageTitle />
      <SkeletonCard className="h-[120px]" />
      <SkeletonRows count={3} />
    </SkeletonScreen>
  )
}
