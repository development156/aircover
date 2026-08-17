import { SkeletonPageTitle, SkeletonRows, SkeletonScreen } from '@/components/skeleton'

/** /posts is a title and a list of post cards. Five rows: the list is capped and
 *  a new workspace typically has a handful, so five is the honest middle. */
export default function PostsLoading() {
  return (
    <SkeletonScreen label="Loading your posts">
      <SkeletonPageTitle />
      <SkeletonRows count={5} />
    </SkeletonScreen>
  )
}
