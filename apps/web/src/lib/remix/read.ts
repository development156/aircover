import 'server-only'

import type { Channel, RemixBatch, RemixDerivative, RemixKind } from '@sahoda/shared'

import * as store from './store'
import { previewBatch, type BatchCost } from './cost'

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
 * Is this batch still a decision somebody can take?
 *
 * `running` is NOT. Nothing in this codebase resumes a batch — a request cut off
 * mid-spend leaves the row at `running` for ever — so treating it as live would
 * wedge the screen: it would render the preview, whose only button refuses a
 * running batch, and never offer a new one. Terminal here means the person can
 * start again, which is the only thing that helps them.
 */
export function isSettled(status: RemixBatch['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'running'
}

/**
 * The newest batch, whatever state it is in — or null when this workspace has
 * never remixed anything.
 *
 * Deliberately NOT "the newest unfinished batch". A run that has just finished
 * is the thing the person is looking at, and hiding it the instant it completed
 * would make the screen forget what it had just done.
 */
export async function readCurrentBatch(workspaceId: string): Promise<BatchView | null> {
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
