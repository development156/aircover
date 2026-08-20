import { CardEmpty } from '@/components/empty-state'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CommentCard } from '@/components/inbox/comment-card'
import { CommentedPostRow } from '@/components/inbox/commented-post-row'
import { InboxShell } from '@/components/inbox/inbox-shell'
import { PaneHeader, PaneScroll } from '@/components/inbox/inbox-panes'
import { SurfaceBanner } from '@/components/inbox/surface-notice'
import { SurfaceList, SurfaceRow } from '@/components/inbox/surface-list'
import { readCommentedPosts, readPostComments } from '@/lib/inbox/read'

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

  // The sibling list, so the comments open beside the posts rather than after
  // leaving them.
  const { rows: siblings, decision: listDecision } = await readCommentedPosts()

  return (
    <InboxShell
      emptiness={decision.state}
      mobileShow="thread"
      list={
        <SurfaceList
          title="Comments"
          isEmpty={!listDecision.showList || siblings.length === 0}
          emptyLine="Nothing else to show."
        >
          {(listDecision.showList ? siblings : []).map((post) => (
            <SurfaceRow key={`${post.accountId}:${post.id}`}>
              <CommentedPostRow post={post} />
            </SurfaceRow>
          ))}
        </SurfaceList>
      }
      thread={
        <>
          <PaneHeader>
            <div className="flex items-center gap-2">
              <Link
                href="/inbox/comments"
                aria-label="Back to comments"
                className="surface-ring grid size-8 shrink-0 place-items-center rounded-sm text-muted transition-micro hover:text-ink wide:hidden"
              >
                <ArrowLeft size={15} aria-hidden />
              </Link>
              <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
                Comments on this post
              </h2>
            </div>
          </PaneHeader>

          <PaneScroll className="p-4">
            <SurfaceBanner state={decision.state} />
            {rows.length === 0 ? (
              // One language across all five inbox routes (docs/26 §4.1). The
              // claim is the classifier's; only the treatment moved.
              <CardEmpty body={decision.state.body} />
            ) : (
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
            )}
          </PaneScroll>
        </>
      }
    />
  )
}
