import { notFound } from 'next/navigation'

import { PostEditor } from '@/components/posts/post-editor'
import { PostMetricsPanel } from '@/components/posts/post-metrics-panel'
import { readPostMetrics } from '@/lib/analytics/post-metrics'
import { variantStatusRows } from '@/lib/posts/variant-status'
import { signMediaPreviews } from '@/lib/posts/media-url'
import { getPost, listMedia, listVariants } from '@/lib/posts/read'
import { autoPublishEnabled } from '@/lib/posts/auto-publish-server'
import { listConnectedChannels } from '@/lib/connections/read'

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

  const [variants, media, connected] = await Promise.all([
    listVariants(post.id),
    listMedia(post.id),
    // Read here so the composer can say "not connected" while the post is being
    // written, instead of at the moment Publish fails with the work already done.
    listConnectedChannels(),
  ])

  // Sequential because it needs the rows. The bucket is private, so only the
  // server can mint these — and `signMediaPreviews` degrades to `url: null` per
  // row rather than throwing, so a signing hiccup costs previews, not the page.
  const previews = await signMediaPreviews(media)

  // Also sequential on the rows: the analytics key lives on them. Degrades to
  // stated "not available" states, so a metrics failure never 404s or blanks the
  // editor — the post is the page, the numbers are an annotation on it.
  const metrics = await readPostMetrics(post.id, variantStatusRows(post.channels, variants))

  return (
    <div className="space-y-grid">
      <PostEditor
        post={post}
        variants={variants}
        media={media}
        previews={previews}
        autoPublish={autoPublishEnabled()}
        connected={connected}
      />

      {/* Under the editor, not inside it: the editor is about changing the post,
          and these are about what already happened to it. */}
      <PostMetricsPanel metrics={metrics} />
    </div>
  )
}
