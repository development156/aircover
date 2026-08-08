import { CommentedPostRow } from '@/components/inbox/commented-post-row'
import { SurfaceBanner, SurfaceNotice } from '@/components/inbox/surface-notice'
import { readCommentedPosts } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox · Comments' }

/**
 * `GET /inbox/comments`, read-only.
 *
 * This endpoint returns the POSTS carrying comments, not the comments — those need a
 * second account-scoped call, which each row links to.
 */
export default async function InboxCommentsPage() {
  const { rows, decision } = await readCommentedPosts()

  if (!decision.showList) {
    return <SurfaceNotice state={decision.state} />
  }

  return (
    <div className="space-y-grid">
      <SurfaceBanner state={decision.state} />
      <ul className="space-y-2" data-guide="inbox.commented-posts">
        {rows.map((post) => (
          <li key={`${post.accountId}:${post.id}`}>
            <CommentedPostRow post={post} />
          </li>
        ))}
      </ul>
    </div>
  )
}
