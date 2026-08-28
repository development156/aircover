import { SquarePen } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { PageTitle } from '@/components/page-title'
import { CreatePostButton } from '@/components/posts/create-post-button'
import { PostCard } from '@/components/posts/post-card'
import { PostGrid } from '@/components/posts/post-grid'
import { listPostMetrics } from '@/lib/analytics/post-metrics'
import { forDisplay } from '@/lib/posts/display-post'
import { readPosts, listVariantStates, listPostMedia, LIST_LIMIT } from '@/lib/posts/read'
import { signMediaPreviews } from '@/lib/posts/media-url'
import type { MediaPeekItem } from '@/components/posts/media-peek'
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
  const [variantStates, connected, photos] = await Promise.all([
    listVariantStates(postIds),
    readConnectedChannels(),
    /**
     * Read the attached photos AND sign them, as one unit inside this
     * `Promise.all` rather than after it.
     *
     * The signing has to follow the read — it needs the storage paths — but that
     * pair as a whole does not depend on anything else on this page. Awaited
     * afterwards it added a NINTH sequential server read to the route and
     * `read-waterfall.test.ts` failed on exactly that, by name. Nested here, the
     * two round trips happen while the variant and connection reads are in
     * flight, and the route's sequential count is unchanged at eight.
     */
    /**
     * Read the attached photos AND sign them, inline, INSIDE this `Promise.all`.
     *
     * ── WHY IT IS AN INLINE FUNCTION AND NOT A NAMED ONE ────────────────────
     * The signing has to follow the read — it needs the storage paths — but the
     * pair as a whole depends on nothing else on this page, so it belongs in
     * flight beside the variant and connection reads rather than after them.
     *
     * Written as a module-level helper it read as TWO more sequential reads and
     * `read-waterfall.test.ts` failed by name (`8 → 10`, "new: listPostMedia,
     * signMediaPreviews"). That ratchet counts top-level awaits in this file and
     * excludes only the spans covered by a `Promise.all`, so where the awaits
     * are WRITTEN is what it can see. Inline, they are inside the span, the
     * route's sequential count stays at eight, and the runtime behaviour matches
     * what the ratchet is measuring rather than merely satisfying it.
     *
     * ── THE PHOTOS, AND THE THREE ANSWERS ───────────────────────────────────
     * The `media` bucket is private, so each preview is a short-lived signed
     * URL. `signMediaPreviews` signs a whole list in one call, so signing per
     * card would be one storage round trip per card — the cost `listPostMedia`
     * exists to avoid. Rows are flattened, signed once, regrouped below.
     *
     * A row whose URL could not be minted is KEPT with `url: null`: dropping it
     * would turn "there is a photo we could not fetch" into "there is no photo",
     * and the writer would attach a second copy of what is already attached.
     * `byPost: null` is the third answer — the read itself failed, which is not
     * a page whose posts have no photos.
     */
    (async () => {
      const byPost = await listPostMedia(postIds)
      const rows = byPost === null ? [] : [...byPost.values()].flat()
      const previews = await signMediaPreviews(rows)
      return { byPost, signed: new Map(previews.map((p) => [p.id, p.url])) }
    })(),
  ])
  const { byPost: mediaByPost, signed } = photos
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

  /**
   * Every attached photo on the page, signed in ONE round trip.
   *
   * ── WHY THE SIGNING IS FLAT AND THE RESULT IS NOT ────────────────────────
   * The `media` bucket is private, so each preview is a short-lived signed URL.
   * `signMediaPreviews` takes a list and signs it in one call, so signing per
   * card would be one storage round trip per card on the screen people leave
   * open — the same cost `listVariantStates` and `listPostMedia` exist to avoid.
   * So the rows are flattened, signed once, and regrouped by post here.
   *
   * A row whose URL could not be minted is KEPT with `url: null`. Dropping it
   * would turn "there is a photo we could not fetch" into "there is no photo",
   * and the writer would attach a second copy of something already attached.
   * `MediaPeek` renders that case as a marked slot.
   */
  const mediaFor = (postId: string): MediaPeekItem[] =>
    (mediaByPost?.get(postId) ?? []).map((row) => ({
      id: row.id,
      url: signed.get(row.id) ?? null,
      alt: row.alt,
    }))
  /**
   * The read itself failed, which is NOT "these posts have no photos".
   *
   * Said ONCE for the page rather than marked on every tile. A marker on each of
   * eight tiles would be eight claims where there is one fact, and it would be
   * loudest on the posts that never had a photo — the tiles it says nothing
   * true about. The tiles simply show no thumbnail, and this line says why.
   */
  const mediaUnreadable = mediaByPost === null

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Posts</PageTitle>
        {/* The empty state owns the only create affordance when there is
            nothing to list — two "Create post" buttons on one screen is noise. */}
        {posts.length > 0 ? <CreatePostButton /> : null}
      </div>

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
            /* The grid owns the <ul> and the fold; the page still owns which
               posts are in it and in what order. `PostGrid` is a client island
               only because the fold has state — the cards inside it are the
               same server components as before and cost no JS. */
            <PostGrid data-guide="posts.list">
              {shown.map((post, i) => (
                /* One ladder across the grid — the tiles deal rather than
                   flashing. Capped in CSS at --stagger-cap, so a full page
                   of posts does not take a second and a half to arrive. */
                <StaggerItem key={post.id} i={i}>
                  <PostCard
                    compact
                    post={post}
                    now={now}
                    variantStates={variantStates.get(post.id) ?? []}
                    metrics={metrics.get(post.id)}
                    media={mediaFor(post.id)}
                    autoPublish={autoPublish}
                  />
                </StaggerItem>
              ))}
            </PostGrid>
          )}

          {mediaUnreadable ? (
            <p className="type-meta text-muted">
              Couldn&rsquo;t check which posts have photos just now, so none are shown here. Nothing
              has been lost. Open a post to see its photos, or reload this page.
            </p>
          ) : null}

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
