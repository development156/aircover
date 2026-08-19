import type { Channel } from '@sahoda/shared'
import { SquarePen } from 'lucide-react'
import { notFound } from 'next/navigation'

import { Composer } from '@/components/composer/composer'
import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { LivePhaseNote } from '@/components/posts/live/live-phase-note'
import { PostMetricsPanel } from '@/components/posts/post-metrics-panel'
import { PublishStateProvider } from '@/components/posts/live/publish-state-provider'
import { assembleSnapshot } from '@/lib/posts/live-state'
import { autoPublishEnabled } from '@/lib/posts/auto-publish-server'
import { readActiveWorkspace } from '@/lib/workspaces'
import { readConnectedChannels } from '@/lib/connections/read'
import { readPostMetrics } from '@/lib/analytics/post-metrics'
import { readTemplates } from '@/lib/templates/read'
import { signMediaPreviews } from '@/lib/posts/media-url'
import { variantStatusRow, variantStatusRows } from '@/lib/posts/variant-status'
import {
  getPost,
  listMedia,
  listVariants,
  readVariantFormats,
  readVariantVersions,
  readVariantVersionSupport,
} from '@/lib/posts/read'

/**
 * THE route for writing a post. One screen, whether the post exists or not.
 *
 * ── WHY `new` IS A VALUE OF `[id]` AND NOT ITS OWN ROUTE ─────────────────────
 * Because there is one screen, and two route files is how there came to be two
 * editors. `/create/post` held a five-step wizard that could not generate
 * variants; `/posts/[id]` held a three-pane editor that could not be reached
 * without a row. Both are gone. `new` is the id of a post that does not exist
 * yet — a real uuid can never collide with it — and everything below simply
 * reads nothing for it.
 *
 * ── THE ROW IS NOT CREATED HERE ──────────────────────────────────────────────
 * Opening a screen is not intent. Creating on open is what left "Untitled post"
 * debris behind every abandoned click, so the row is created by the first SAVE
 * that has something to write (`useAutosave`'s `ensurePostId`), and the address
 * bar is rewritten to `/posts/<id>` at that moment.
 */
export const metadata = { title: 'Write' }

/** The id that means "this post does not exist yet". Never a uuid. */
const NEW = 'new'

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === NEW

  /**
   * ── REFUSED BEFORE THE WORK, NOT AFTER IT ───────────────────────────────────
   * `createPost` refuses an account with no workspace — correctly — but it only
   * gets the chance once something has been written. That is the same surprise
   * every other refusal on this screen exists to prevent, and it is the one
   * behaviour the deleted wizard had that this route did not.
   *
   * Only asked on the new-post path: reaching `/posts/<uuid>` at all means the
   * RLS-scoped read found a row, which means a workspace.
   */
  if (isNew) {
    const workspace = await readActiveWorkspace()
    if (workspace.status === 'none') {
      return (
        <EmptyState
          icon={SquarePen}
          title="Create a workspace to start writing"
          body="A post belongs to a workspace and you don't have one yet. Nothing failed — there is simply nowhere to keep what you write until one exists."
          action={<CreateWorkspaceButton variant="primary" />}
        />
      )
    }
  }

  const post = isNew ? null : await getPost(id)
  // A missing post is the ONLY 404 condition. Every other read below degrades to
  // empty rather than throwing — an empty variant or media list is a legitimate
  // state the composer renders on its own.
  if (!isNew && post === null) notFound()

  const [variants, versions, media, connected, templates] = await Promise.all([
    post ? listVariants(post.id) : Promise.resolve([]),
    // With a post, the versions come out of rows already read. WITHOUT one, the
    // question is asked of the table itself — skipping that would put the very
    // first save of a new post back on last-write-wins, which is the save two
    // tabs are most likely to make at the same moment.
    post ? readVariantVersions(post.id) : readVariantVersionSupport(),
    post ? listMedia(post.id) : Promise.resolve([]),
    // Read here so the composer can say "not connected" while the post is being
    // written, instead of at the moment Publish fails with the work already done.
    readConnectedChannels(),
    readTemplates(),
  ])

  // Free alongside the reads above: the same memoised rows. Salvages the column
  // the frozen row schema strips, so a reload does not lose the chosen format.
  const formats = post ? await readVariantFormats(post.id) : {}

  // The gate models NOT KNOWN as `undefined` and answers it with silence (see
  // `unconnectedFrom`). An empty set from a FAILED read would read to the gate as
  // "known: nothing is connected", so a hiccup would tell the writer every picked
  // channel was disconnected.
  const connectedChannels =
    connected.status === 'ok'
      ? connected.channels
      : connected.status === 'no-workspace'
        ? new Set<Channel>()
        : undefined

  // Sequential on the rows: the bucket is private, so only the server can mint
  // these — and `signMediaPreviews` degrades to `url: null` per row rather than
  // throwing, so a signing hiccup costs previews, not the page.
  const previews = media.length > 0 ? await signMediaPreviews(media) : []

  const composer = (
    <Composer
      post={post}
      variants={variants}
      versions={versions}
      formats={formats}
      media={media}
      previews={previews}
      templates={templates}
      autoPublish={autoPublishEnabled()}
      connected={connectedChannels}
    />
  )

  if (post === null) {
    return (
      <>
        {/* The composer's own title is an INPUT, so this screen would otherwise
            have no heading at all — invisible to anyone navigating by headings.
            Visually hidden rather than shown: the layout is settled and does not
            get a page title, but a document still needs one. */}
        <h1 className="sr-only">Write a post</h1>
        {composer}
      </>
    )
  }

  // Seeded from the rows this render already holds. `variantStatusRow` is the
  // same function `listVariantStates` uses, so the seed and the poll produce
  // identical rows — including `simulated`, which is computed from the
  // `fixture://` permalink before that permalink is nulled.
  const liveSeed = assembleSnapshot(
    [{ id: post.id, status: post.status, scheduledAt: post.scheduled_at }],
    new Map([[post.id, variants.map(variantStatusRow)]]),
    new Date().toISOString(),
  )

  // Degrades to stated "not available" states, so a metrics failure never 404s or
  // blanks the composer — the post is the page, the numbers are an annotation.
  const metrics = await readPostMetrics(post.id, variantStatusRows(post.channels, variants))

  return (
    <PublishStateProvider initial={liveSeed}>
      <h1 className="sr-only">Edit post</h1>
      {composer}
      {/* Under the composer, not inside it: the composer is about changing the
          post, and these are about what already happened to it. */}
      <LivePhaseNote className="mt-2" />
      <PostMetricsPanel metrics={metrics} />
    </PublishStateProvider>
  )
}
