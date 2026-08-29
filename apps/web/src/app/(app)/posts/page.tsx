import { SquarePen } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { PageTitle } from '@/components/page-title'
import { CreatePostButton } from '@/components/posts/create-post-button'
import { PostCard } from '@/components/posts/post-card'
import { listPostMetrics } from '@/lib/analytics/post-metrics'
import { forDisplay } from '@/lib/posts/display-post'
import { readPosts, listVariantStates, LIST_LIMIT } from '@/lib/posts/read'
import { assembleSnapshot } from '@/lib/posts/live-state'
import { PublishStateProvider } from '@/components/posts/live/publish-state-provider'
import { LivePhaseNote } from '@/components/posts/live/live-phase-note'
import { autoPublishEnabled } from '@/lib/posts/auto-publish-server'
import { readConnectedChannels } from '@/lib/connections/read'
import { ConnectFirstNote } from '@/components/connections/connect-first-note'
import { PostFilters, POST_FILTERS, filterFor } from '@/components/posts/post-filters'
import { StaggerItem } from '@/components/motion/stagger'
import { CardEmpty } from '@/components/empty-state'

export const metadata = { title: 'Posts' }

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter: filterSlug } = await searchParams
  // THREE answers, and this page used to render one sentence for all of them.
  // "Nothing drafted yet · Create post" was shown to a workspace with forty posts
  // whose read hiccuped, and to an account with no workspace at all — where the
  // button it offers refuses with "Create a workspace first."
  const read = await readPosts()
  const posts = read.status === 'ok' ? read.posts : []
  // The evidence behind any "it happened" claim. Fails safe to an empty map, in
  // which case every chip renders the weaker claim rather than a solid publish.
  const postIds = posts.map((post) => post.id)
  // Batched for the whole page: one query, not one per card.
  const [variantStates, connected] = await Promise.all([
    listVariantStates(postIds),
    readConnectedChannels(),
  ])
  // Read the clock once and pass it down, so every card on the page agrees on
  // which scheduled posts are past due. See `AutoPublishNote`.
  const autoPublish = autoPublishEnabled()
  const now = new Date()

  // Metrics last, because they need the variant rows: the analytics key is
  // `post_variants.platform_post_id`, and a channel without one is never asked
  // about at all. Bounded inside `listPostMetrics`, and it degrades to stated
  // "not available" states rather than throwing — a metrics hiccup must not cost
  // the list.
  const metrics = await listPostMetrics(variantStates, now)

  // The provider's seed, assembled from reads this page has ALREADY done —
  // `listPosts` returns `status` and `scheduled_at`, and the two maps are right
  // there. So live updates cost this render exactly nothing; the first paint is
  // still one server pass with no fetch behind it.
  const liveSeed = assembleSnapshot(
    posts.map((post) => ({
      id: post.id,
      status: post.status,
      scheduledAt: post.scheduled_at,
    })),
    variantStates,
    now.toISOString(),
  )

  // Converted at the page boundary, in the open: past this line no component can
  // reach `post.status` at all. See `display-post.ts`.
  const all = posts.map(forDisplay)

  // Filtering is over the LOADED page, not a second query — see post-filters.tsx
  // for why the counts are honest at that scope and what keeps them so.
  const active = filterFor(filterSlug)
  const shown = all.filter((post) => active.match(post.intent))
  const counts = Object.fromEntries(
    POST_FILTERS.map((f) => [f.slug, all.filter((post) => f.match(post.intent)).length]),
  )

  return (
    <div className="space-y-grid">
      {/* The empty state owns the only create affordance when there is
          nothing to list — two "Create post" buttons on one screen is noise. */}
      <PageTitle actions={posts.length > 0 ? <CreatePostButton /> : null}>Posts</PageTitle>

      <ConnectFirstNote connections={connected} />

      {read.status === 'unreadable' ? (
        <p className="rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          Couldn&rsquo;t load your posts just now &mdash; reload to see them. Nothing has been lost.
        </p>
      ) : read.status === 'no-workspace' ? (
        <EmptyState
          icon={SquarePen}
          title="Create a workspace to start writing"
          body="Posts belong to a workspace and you don't have one yet. Nothing failed. There is simply nowhere to keep a draft until one exists."
          action={<CreateWorkspaceButton variant="primary" />}
        />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={SquarePen}
          title="Nothing drafted yet"
          body="Start a post here, then let me write the per-channel versions for you."
          action={<CreatePostButton />}
          tip="Write the idea once. Sahoda reshapes it for each channel, so you never rewrite the same thought four times."
        />
      ) : (
        <PublishStateProvider initial={liveSeed}>
          <PostFilters active={active.slug} counts={counts} />

          {shown.length === 0 ? (
            // A filter that matches nothing is NOT the page's empty state: the
            // workspace has posts, this bucket does not. Saying "Nothing drafted
            // yet" here would be false, and offering "Create post" would answer
            // a question the reader did not ask.
            <div className="surface-ring rounded-card bg-surface">
              <CardEmpty
                body={`No posts in ${active.label.toLowerCase()} right now. The other filters still have your ${all.length} post${all.length === 1 ? '' : 's'}.`}
              />
            </div>
          ) : (
            <ul className="space-y-grid" data-guide="posts.list">
              {shown.map((post, i) => (
                <li key={post.id}>
                  {/* One ladder down the list — the rows deal rather than
                      flashing. Capped in CSS at --stagger-cap, so a full page
                      of posts does not take a second and a half to arrive. */}
                  <StaggerItem i={i}>
                    <PostCard
                      post={post}
                      now={now}
                      variantStates={variantStates.get(post.id) ?? []}
                      metrics={metrics.get(post.id)}
                      autoPublish={autoPublish}
                    />
                  </StaggerItem>
                </li>
              ))}
            </ul>
          )}

          <LivePhaseNote />

          {/* `listPosts` is capped and there is no pagination yet. Hitting the cap
              silently would show a partial list as if it were the whole workspace,
              so we say it. Worded with "may" — a workspace of exactly LIST_LIMIT
              posts is complete and we do not assert otherwise. */}
          {posts.length === LIST_LIMIT ? (
            <p className="text-[13px] tabular-nums text-muted">
              Showing the {LIST_LIMIT} most recently updated posts. Older ones may not be on this
              page.
            </p>
          ) : null}
        </PublishStateProvider>
      )}
    </div>
  )
}
