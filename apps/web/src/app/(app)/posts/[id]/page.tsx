import { notFound } from 'next/navigation'

import { PostEditor } from '@/components/posts/post-editor'
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

  return (
    <div className="space-y-grid">
      <PostEditor post={post} variants={variants} media={media} />
    </div>
  )
}
