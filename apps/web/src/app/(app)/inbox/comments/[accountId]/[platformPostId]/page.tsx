import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CommentCard } from '@/components/inbox/comment-card'
import { SurfaceBanner, SurfaceNotice } from '@/components/inbox/surface-notice'
import { readPostComments } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox · Post comments' }

/**
 * `GET /inbox/comments/{platformPostId}`, and the reply that goes back the other way.
 *
 * Two segments for the same reason the thread route has two: Zernio scopes this read by
 * `accountId`, and a post id alone would read against whichever account matched. The id
 * in the path is the PLATFORM's post id, not ours — our `posts.id` means nothing to
 * Zernio, and conflating the two is a defect this repo has already shipped once.
 */
export default async function PostCommentsPage({
  params,
}: {
  params: Promise<{ accountId: string; platformPostId: string }>
}) {
  const { accountId, platformPostId } = await params
  const view = await readPostComments(accountId, platformPostId)

  // The account is not this workspace's. A 404 rather than an explanation: confirming
  // that some other tenant's account id exists is itself a disclosure.
  if (view === null) notFound()
  const { rows, decision } = view

  return (
    <div className="space-y-grid">
      <Link
        href="/inbox/comments"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-micro hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Back to comments
      </Link>

      {rows.length === 0 ? (
        <SurfaceNotice state={decision.state} showConnectAction={false} />
      ) : (
        <>
          <SurfaceBanner state={decision.state} />
          <ul className="space-y-2" data-guide="inbox.post-comments">
            {rows.map((comment) => (
              <li key={comment.id}>
                <CommentCard
                  comment={comment}
                  accountId={accountId}
                  platformPostId={platformPostId}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
