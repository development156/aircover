import 'server-only'

import type { Channel, RemixBatch, RemixDerivative, RemixKind } from '@sahoda/shared'

import { previewBatch, type BatchCost } from './cost'
import { RemixReadError } from './read-error'
import * as store from './store'

/**
 * WHAT /remix READS — the batch in front of the person, and nothing else.
 *
 * A screen that showed every batch a workspace has ever run would be a history
 * page. This one is a workbench: there is at most one batch being decided, and
 * the finished ones are drafts now, which live in `/posts` where drafts live.
 */

export interface DerivativeView {
  readonly id: string
  readonly kind: RemixKind
  readonly channel: Channel
  readonly format: string
  readonly included: boolean
  readonly status: RemixDerivative['status']
  readonly postId: string | null
  readonly failure: string | null
}

export interface BatchView {
  readonly id: string
  readonly status: RemixBatch['status']
  readonly sourcePostId: string | null
  readonly sourceTitle: string | null
  readonly sourceCredit: string | null
  readonly approvedCredits: number | null
  readonly derivatives: readonly DerivativeView[]
  /** Priced by the SAME function the runner charges from. */
  readonly cost: BatchCost
}

function toView(derivative: RemixDerivative): DerivativeView {
  return {
    id: derivative.id,
    kind: derivative.kind,
    channel: derivative.channel,
    format: derivative.format,
    included: derivative.included,
    status: derivative.status,
    postId: derivative.post_id,
    failure: derivative.failure,
  }
}

/**
 * What the page is told. Three nothings, kept apart:
 *
 *   `{ status: 'ok', batch: null }`  this workspace has never remixed anything
 *   `{ status: 'ok', batch }`        the newest batch, whatever state it is in
 *   `{ status: 'unreadable' }`       the database refused the read
 *
 * The third used to be reported as the first, and the screen offered the free
 * planner beside a batch it could not see.
 */
export type CurrentBatchRead =
  { readonly status: 'ok'; readonly batch: BatchView | null } | { readonly status: 'unreadable' }

/**
 * The sentence for the third outcome. It claims a failed READ and nothing else:
 * not "no batches", which is the claim it replaces, and not "nothing was
 * charged", because a page load never charges and saying so would imply one
 * could. Reloading is a real remedy for a read that failed once.
 */
export const REMIX_UNREADABLE_COPY =
  'Sahoda could not read your remix batches, so this screen cannot say whether one is ' +
  'in progress. Reload to ask again.'

/**
 * The newest batch, whatever state it is in — or none when this workspace has
 * never remixed anything — or UNREADABLE when the database refused to say.
 *
 * Deliberately NOT "the newest unfinished batch". A run that has just finished
 * is the thing the person is looking at, and hiding it the instant it completed
 * would make the screen forget what it had just done.
 *
 * Only a `RemixReadError` becomes the unreadable outcome. Anything else is a
 * programming error and is left to throw: dressing it as a read failure would
 * hide it behind a sentence that blames the database.
 */
export async function readCurrentBatchOutcome(workspaceId: string): Promise<CurrentBatchRead> {
  try {
    return { status: 'ok', batch: await readNewest(workspaceId) }
  } catch (error) {
    if (error instanceof RemixReadError) return { status: 'unreadable' }
    throw error
  }
}

/** The read itself. Lets the store's `RemixReadError` through untouched. */
async function readNewest(workspaceId: string): Promise<BatchView | null> {
  const [batch] = await store.listBatches(workspaceId, 1)
  if (!batch) return null

  const derivatives = await store.readDerivatives(batch.id, workspaceId)
  return {
    id: batch.id,
    status: batch.status,
    sourcePostId: batch.source_post_id,
    sourceTitle: batch.source_title,
    sourceCredit: batch.source_credit,
    approvedCredits: batch.approved_credits,
    derivatives: derivatives.map(toView),
    cost: previewBatch(derivatives),
  }
}

/**
 * The shape `app/(app)/remix/page.tsx` still imports.
 *
 * An unreadable batch THROWS rather than returning null. Null is the planner,
 * which is the defect; a throw reaches the route's error boundary, whose copy
 * blames our side and offers a retry, which is at least true. The page should
 * move to `readCurrentBatchOutcome` and render `REMIX_UNREADABLE_COPY` in place
 * of both the planner and the empty state; when it does, this wrapper goes.
 */
export function readCurrentBatch(workspaceId: string): Promise<BatchView | null> {
  return readNewest(workspaceId)
}
