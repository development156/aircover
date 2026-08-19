import type { Channel } from '@sahoda/shared'
import { notFound } from 'next/navigation'

import { PostEditor } from '@/components/posts/post-editor'
import { PostMetricsPanel } from '@/components/posts/post-metrics-panel'
import { readPostMetrics } from '@/lib/analytics/post-metrics'
import { variantStatusRows } from '@/lib/posts/variant-status'
import { signMediaPreviews } from '@/lib/posts/media-url'
import { readLibraryNames } from '@/lib/assets/read'
import { getPost, listMedia, listVariants, readVariantVersions } from '@/lib/posts/read'
import { assembleSnapshot } from '@/lib/posts/live-state'
import { PublishStateProvider } from '@/components/posts/live/publish-state-provider'
import { LivePhaseNote } from '@/components/posts/live/live-phase-note'
import { variantStatusRow } from '@/lib/posts/variant-status'
import { autoPublishEnabled } from '@/lib/posts/auto-publish-server'
import { readConnectedChannels } from '@/lib/connections/read'

export const metadata = { title: 'Post' }

/**
 * Thin server shell. All three reads are RLS-scoped and degrade to empty rather
 * than throwing, so a missing post is the ONLY 404 condition here — an empty
 * variant/media list is a legitimate state the editor renders on its own.
 */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const post = await getPost(id)
  if (!post) notFound()

  const [variants, versions, media, connected] = await Promise.all([
    listVariants(post.id),
    // Free alongside the line above: both read the same memoised query, and this
    // one salvages the `version` column the frozen contract strips out.
    readVariantVersions(post.id),
    listMedia(post.id),
    // Read here so the composer can say "not connected" while the post is being
    // written, instead of at the moment Publish fails with the work already done.
    readConnectedChannels(),
  ])

  // The gate models NOT KNOWN as `undefined` and answers it with silence (see
  // `unconnectedFrom`); this read was the half that could not say it. An empty
  // set from a FAILED read reads to the gate as "known: nothing is connected",
  // so a hiccup told the writer every picked channel was disconnected.
  const connectedChannels =
    connected.status === 'ok'
      ? connected.channels
      : connected.status === 'no-workspace'
        ? new Set<Channel>()
        : undefined

  // Seeded from the rows this render already holds. `variantStatusRow` is the
  // same function `listVariantStates` uses, so the seed and the poll produce
  // identical rows — including `simulated`, which is computed from the
  // `fixture://` permalink before that permalink is nulled.
  const liveSeed = assembleSnapshot(
    [{ id: post.id, status: post.status, scheduledAt: post.scheduled_at }],
    new Map([[post.id, variants.map(variantStatusRow)]]),
    new Date().toISOString(),
  )

  // Sequential because it needs the rows. The bucket is private, so only the
  // server can mint these — and `signMediaPreviews` degrades to `url: null` per
  // row rather than throwing, so a signing hiccup costs previews, not the page.
  const previews = await signMediaPreviews(media)

  // The library's own names for whichever attachments came from it. A photo the
  // owner called "shopfront.png" showed on the post as its storage uuid until
  // this read existed. Degrades to an empty map, which is the pre-library
  // behaviour, so a hiccup costs a nicer label and nothing else.
  const libraryNames = Object.fromEntries(
    await readLibraryNames(media.map((row) => row.storage_path)),
  )

  // Also sequential on the rows: the analytics key lives on them. Degrades to
  // stated "not available" states, so a metrics failure never 404s or blanks the
  // editor — the post is the page, the numbers are an annotation on it.
  const metrics = await readPostMetrics(post.id, variantStatusRows(post.channels, variants))

  return (
    <PublishStateProvider initial={liveSeed}>
      <div className="space-y-grid">
        {/* The editor's own "title" is an INPUT, so this screen had no heading
            at all — invisible to anyone navigating by headings, and the second
            screen in the app with that gap. Visually hidden rather than shown:
            the editor's layout is settled and does not get a page title, but a
            document still needs one. */}
        <h1 className="sr-only">Edit post</h1>
        <PostEditor
          post={post}
          variants={variants}
          versions={versions}
          media={media}
          previews={previews}
          libraryNames={libraryNames}
          autoPublish={autoPublishEnabled()}
          connected={connectedChannels}
        />

        {/* Under the editor, not inside it: the editor is about changing the post,
          and these are about what already happened to it. */}
        <LivePhaseNote className="mt-2" />

        <PostMetricsPanel metrics={metrics} />
      </div>
    </PublishStateProvider>
  )
}
