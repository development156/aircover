import { notFound } from 'next/navigation'

import { PostEditor } from '@/components/posts/post-editor'
import { signMediaPreviews } from '@/lib/posts/media-url'
import { getPost, listMedia, listVariants } from '@/lib/posts/read'

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

  const [variants, media] = await Promise.all([listVariants(post.id), listMedia(post.id)])

  // Sequential because it needs the rows. The bucket is private, so only the
  // server can mint these — and `signMediaPreviews` degrades to `url: null` per
  // row rather than throwing, so a signing hiccup costs previews, not the page.
  const previews = await signMediaPreviews(media)

  return (
    <div className="space-y-grid">
      <PostEditor post={post} variants={variants} media={media} previews={previews} />
    </div>
  )
}
