import { CommentedPostRow } from '@/components/inbox/commented-post-row'
import { InboxShell } from '@/components/inbox/inbox-shell'
import { SurfaceList, SurfaceRow } from '@/components/inbox/surface-list'
import { ThreadPlaceholder } from '@/components/inbox/thread-placeholder'
import { readCommentedPosts } from '@/lib/inbox/read'

export const metadata = { title: 'Inbox · Comments' }

/**
 * `GET /inbox/comments`, read-only — now in the shared inbox shell.
 *
 * This endpoint returns the POSTS carrying comments, not the comments — those
 * need a second account-scoped call, which each row links to. That two-step is
 * exactly why the three panes suit it: the post list stays on screen while its
 * comments open beside it.
 *
 * `showList` no longer replaces the whole screen. In one column that was right;
 * in three panes it would also remove the list header and the layout, so a new
 * user would never see what this surface IS.
 */
export default async function InboxCommentsPage() {
  const { rows, decision } = await readCommentedPosts()
  const posts = decision.showList ? rows : []

  return (
    <InboxShell
      emptiness={decision.state}
      mobileShow={posts.length > 0 ? 'list' : 'thread'}
      hasSomethingToOpen={posts.length > 0}
      list={
        <SurfaceList
          title="Comments"
          isEmpty={posts.length === 0}
          waitingLine="Posts people have commented on appear here, most recent first."
        >
          {posts.map((post) => (
            <SurfaceRow key={`${post.accountId}:${post.id}`}>
              <CommentedPostRow post={post} />
            </SurfaceRow>
          ))}
        </SurfaceList>
      }
      thread={
        <ThreadPlaceholder
          emptiness={decision.state}
          hasConversations={posts.length > 0}
          selectLine="Pick a post to read its comments."
        />
      }
    />
  )
}
