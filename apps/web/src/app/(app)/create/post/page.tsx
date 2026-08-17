import { Suspense } from 'react'
import type { Channel } from '@sahoda/shared'

import { CreateFlow } from '@/components/create/create-flow'
import { listConnectedChannels } from '@/lib/connections/read'
import { getPost, listVariants } from '@/lib/posts/read'

export const metadata = { title: 'New post' }

/**
 * The create flow's page. Full-screen, not a modal — see CreateFlow.
 *
 * ── WHY THE POST IS READ HERE AND NOT HELD IN THE CLIENT ─────────────────────
 * The flow used to keep channels and bodies in React state, which meant a
 * reload — or a phone backgrounding the tab — silently discarded everything the
 * person had written. It is now backed by a real row: the id travels in
 * `?post=`, and every step rehydrates from `posts` and `post_variants`.
 *
 * That is also what makes R1 verifiable rather than merely asserted. The
 * per-channel bodies come back from `post_variants`, one row per channel, so
 * "two channels kept two different bodies" is a fact about the database and not
 * about a component's memory.
 *
 * A missing or foreign id resolves to null through the RLS-scoped read, and the
 * flow simply starts fresh rather than erroring — an id someone else's
 * workspace owns is indistinguishable from one that never existed, which is the
 * correct answer to give either way.
 */
export default async function CreatePostPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string; step?: string }>
}) {
  const { post: postId } = await searchParams

  // `listConnectedChannels` already answers "what can publish right now" —
  // active rows only, null-safe. Re-filtering listConnections() here would be a
  // second, drifting copy of that rule.
  let connected: Channel[] = []
  try {
    connected = [...(await listConnectedChannels())]
  } catch {
    // Leave it empty: "Not connected · you can still write" never claims a
    // channel is live when we could not read it, and never blocks the flow.
    connected = []
  }

  const post = postId ? await getPost(postId) : null
  const variants = post ? await listVariants(post.id) : []

  return (
    <Suspense fallback={null}>
      <CreateFlow
        connected={connected}
        postId={post?.id ?? null}
        initialChannels={(post?.channels ?? []) as Channel[]}
        initialBodies={Object.fromEntries(variants.map((v) => [v.channel, v.body]))}
        initialScheduledAt={post?.scheduled_at ?? null}
      />
    </Suspense>
  )
}
