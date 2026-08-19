import { Suspense } from 'react'
import type { Channel } from '@sahoda/shared'

import { SquarePen } from 'lucide-react'

import { CreateFlow } from '@/components/create/create-flow'
import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { readActiveWorkspace } from '@/lib/workspaces'
import { listConnectedChannels } from '@/lib/connections/read'
import {
  getPost,
  listMedia,
  listVariants,
  readVariantVersions,
  readVariantVersionSupport,
} from '@/lib/posts/read'
import { signMediaPreviews } from '@/lib/posts/media-url'

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

  /**
   * ── THE FIVE-STEP FLOW OFFERED TO AN ACCOUNT THAT CANNOT SAVE A POST ────────
   * MEASURED on a seeded account with no workspace: /create/post rendered all
   * five steps and every channel chip. `createPost` refuses with "Create a
   * workspace first." — correctly — but only AFTER the channels are picked and
   * Continue is pressed, so the refusal arrives at the end of the work rather
   * than before it. That is the same surprise `ConnectFirstNote` exists to
   * prevent one layer up, and the same one this page's own comment describes
   * about learning at Publish that no account was attached.
   */
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
  // With a post, the versions come out of the rows already read. WITHOUT one —
  // the first visit, before Continue has created anything — there are no rows to
  // read, so the question is asked of the table itself. Skipping that case would
  // put the very first save of a new post back on last-write-wins, which is the
  // save two tabs are most likely to make at the same moment.
  const versions = post ? await readVariantVersions(post.id) : await readVariantVersionSupport()
  // Media travels with the post so the flow's panel is the SAME panel the
  // editor shows — same rows, same signed previews, same per-channel
  // attachment rules. Two media surfaces reading different sources is how one
  // of them ends up claiming an image the other cannot see.
  const media = post ? await listMedia(post.id) : []
  const previews = media.length > 0 ? await signMediaPreviews(media) : []

  return (
    <Suspense fallback={null}>
      <CreateFlow
        connected={connected}
        postId={post?.id ?? null}
        initialChannels={(post?.channels ?? []) as Channel[]}
        initialBodies={Object.fromEntries(variants.map((v) => [v.channel, v.body]))}
        initialScheduledAt={post?.scheduled_at ?? null}
        media={media}
        previews={previews}
        postChannels={post?.channels ?? null}
        versions={versions}
      />
    </Suspense>
  )
}
