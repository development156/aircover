import { SquarePen } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { CreatePostButton } from '@/components/posts/create-post-button'
import { PostCard } from '@/components/posts/post-card'
import { listPosts, listPublishModes,
  listVariantStates, LIST_LIMIT } from '@/lib/posts/read'
import { autoPublishEnabled } from '@/lib/posts/auto-publish-server'

export const metadata = { title: 'Posts' }

export default async function PostsPage() {
  const posts = await listPosts()
  // The evidence behind any "it happened" claim. Fails safe to an empty map, in
  // which case every chip renders the weaker claim rather than a solid publish.
  const postIds = posts.map((post) => post.id)
  // Batched for the whole page: one query, not one per card.
  const [modes, variantStates] = await Promise.all([
    listPublishModes(postIds),
    listVariantStates(postIds),
  ])
  // Read the clock once and pass it down, so every card on the page agrees on
  // which scheduled posts are past due. See `AutoPublishNote`.
  const autoPublish = autoPublishEnabled()
  const now = new Date()

  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Posts</PageTitle>
        {/* The empty state owns the only create affordance when there is
            nothing to list — two "Create post" buttons on one screen is noise. */}
        {posts.length > 0 ? <CreatePostButton /> : null}
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={SquarePen}
          title="Nothing drafted yet"
          body="Start a post here, then let me write the per-channel versions for you."
          action={<CreatePostButton />}
          tip="Write the idea once. I reshape it for each channel, so you never rewrite the same thought four times."
        />
      ) : (
        <>
          <ul className="space-y-grid" data-guide="posts.list">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard
                  post={post}
                  now={now}
                  mode={modes.get(post.id) ?? null}
                  variantStates={variantStates.get(post.id)}
                  autoPublish={autoPublish}
                />
              </li>
            ))}
          </ul>

          {/* `listPosts` is capped and there is no pagination yet. Hitting the cap
              silently would show a partial list as if it were the whole workspace,
              so we say it. Worded with "may" — a workspace of exactly LIST_LIMIT
              posts is complete and we do not assert otherwise. */}
          {posts.length === LIST_LIMIT ? (
            <p className="text-[13px] tabular-nums text-muted">
              Showing the {LIST_LIMIT} most recently updated posts — older ones may not be on this
              page.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
