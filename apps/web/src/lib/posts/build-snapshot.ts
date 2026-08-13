import 'server-only'

import { listPostLifecycles, listVariantStates } from '@/lib/posts/read'
import { assembleSnapshot, type PublishSnapshot } from '@/lib/posts/live-state'

/**
 * Assemble one publish snapshot for a page of posts, from scratch.
 *
 * This is the POLLED path. The list screens seed their provider with
 * `assembleSnapshot` directly, because they have already read all three inputs
 * for the render — a poll has no render to borrow from, so it reads them itself.
 * Both end at the same pure assembler, so the seed and every update that follows
 * it are built by one piece of code.
 *
 * Two reads, both against OUR OWN Postgres and both batched for the whole page:
 * lifecycles (`posts`) and per-channel outcomes (`post_variants`). It was three
 * until `post_publish_logs` turned out to be a second derivation of what the
 * variant rows already prove — see `publish-evidence.ts`. Zernio is not touched
 * — not once, on any path.
 * That is the property the caller's cadence depends on: `listPostMetrics` spends
 * up to `LIST_METRIC_CALLS` (6) Zernio calls per render against a 60/min ceiling
 * shared with analytics and the inbox, so anything that re-rendered the page
 * would be unaffordable on a five-second timer. Metrics stay exactly as the
 * server rendered them, which also means a poll can never blank a panel that
 * already had numbers in it.
 *
 * Concurrent, because the two reads are independent and a poll is on a clock.
 * Each degrades to empty rather than throwing, so the result is always
 * well-formed — and a post that drops out of the lifecycle read simply keeps
 * whatever the last good render put on screen.
 */
export async function buildPublishSnapshot(postIds: string[]): Promise<PublishSnapshot> {
  // The server's clock, stamped once. Never the client's: the point of `readAt`
  // is to be a fact the browser did not author.
  const readAt = new Date().toISOString()
  if (postIds.length === 0) return { posts: [], readAt }

  const [lifecycles, variantStates] = await Promise.all([
    listPostLifecycles(postIds),
    listVariantStates(postIds),
  ])

  // Driven by the LIFECYCLE rows, not by the requested ids: a post that has been
  // deleted, or is no longer visible to this workspace, drops out of the snapshot
  // rather than appearing with a fabricated status.
  return assembleSnapshot(lifecycles, variantStates, readAt)
}
