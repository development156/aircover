import type { Channel } from '@sahoda/shared'
import type { DispatchMode } from '../env'
import { isPublishQueueUnavailable } from './queue'
import {
  classifyCandidate,
  type DispatchCandidate,
  type DispatchDecision,
  type HoldReason,
} from './classify'

/** One publishPost enqueue. The runner owns the queue; this shape is all the sweep knows. */
export interface EnqueuePublishIntent {
  workspaceId: string
  postId: string
  variantId: string
  channel: Channel
  /** The post's own scheduled_at — the third component of the idempotency key. */
  scheduledAt: string
}

export interface DispatchSweepDeps {
  mode: DispatchMode
  graceSeconds: number
  listCandidates(): Promise<DispatchCandidate[]>
  enqueuePublish(intent: EnqueuePublishIntent): Promise<void>
  /**
   * Both writers return whether a row actually changed. The statements carry their own
   * guards, so `false` means the row moved between the read and the write — a correct
   * refusal, not an error, and it must not be counted as work done.
   */
  expirePost(postId: string, workspaceId: string): Promise<boolean>
  settlePost(
    postId: string,
    workspaceId: string,
    status: 'published' | 'partial' | 'failed',
  ): Promise<boolean>
  now?(): Date
}

/** A decision flattened for the report. Enough to review without re-reading the database. */
export interface DecisionSummary {
  postId: string
  kind: DispatchDecision['kind']
  reason?: string
  status?: string
  channels?: Channel[]
  publishedChannels?: Channel[]
  unpublishedChannels?: Channel[]
}

export interface DispatchSweepReport {
  mode: DispatchMode
  scanned: number
  /** Executed counts. Zero in `off` and `report`. */
  enqueued: number
  expired: number
  settled: number
  /** Intent counts. Populated in every mode, so `report` is comparable to `on`. */
  wouldDispatch: number
  wouldExpire: number
  wouldSettle: number
  held: number
  holdsByReason: Partial<Record<HoldReason, number>>
  /** A guarded write the database declined because the row had moved. */
  blockedByGuard: number
  /**
   * A dispatch this deployment had nowhere to send. NOT a failed publish: nothing was
   * attempted and the post is left exactly as it was, so the next tick sees it again.
   */
  queueUnavailable: number
  failed: number
  decisions: DecisionSummary[]
}

/**
 * The scheduled-publish dispatcher: find posts whose time has come, send them, and give
 * the ones that will never go out an honest terminal status.
 *
 * `mode` is the whole safety story (apps/jobs/src/env.ts). `off` does not even read
 * candidates; `report` classifies everything and writes nothing, so the classification can
 * be reviewed against real production rows before it is trusted; only `on` executes.
 *
 * Settles are applied before expiries. That is the ordering half of the owner's ruling —
 * fan-in first, so a post that just published is recorded as published before anything
 * considers expiring it. The other half lives in the SQL: the expiry statement carries its
 * own NOT EXISTS (published variant) guard permanently, because ordering alone cannot help
 * if a variant publishes between this read and this write.
 *
 * One post's failure never aborts the sweep. A poison row would otherwise strand every
 * later workspace's posts until someone intervened — the same rule the hold sweep follows.
 */
export async function runDispatchSweep(deps: DispatchSweepDeps): Promise<DispatchSweepReport> {
  const report: DispatchSweepReport = {
    mode: deps.mode,
    scanned: 0,
    enqueued: 0,
    expired: 0,
    settled: 0,
    wouldDispatch: 0,
    wouldExpire: 0,
    wouldSettle: 0,
    held: 0,
    holdsByReason: {},
    blockedByGuard: 0,
    queueUnavailable: 0,
    failed: 0,
    decisions: [],
  }

  if (deps.mode === 'off') return report

  // One instant for the whole sweep. Re-reading the clock per post could put two posts
  // scheduled for the same second on opposite sides of the grace boundary.
  const now = (deps.now ?? (() => new Date()))()

  const candidates = await deps.listCandidates()
  report.scanned = candidates.length

  const decisions = candidates.map((c) =>
    classifyCandidate(c, { now, graceSeconds: deps.graceSeconds }),
  )

  for (const decision of decisions) {
    report.decisions.push(summarize(decision))
    switch (decision.kind) {
      case 'dispatch':
        report.wouldDispatch += 1
        break
      case 'expire':
        report.wouldExpire += 1
        break
      case 'settle':
        report.wouldSettle += 1
        break
      case 'hold':
        report.held += 1
        report.holdsByReason[decision.reason] = (report.holdsByReason[decision.reason] ?? 0) + 1
        break
    }
  }

  if (deps.mode === 'report') return report

  // Fan-in first, then dispatch, then expiry — the destructive one goes last.
  for (const d of decisions) {
    if (d.kind !== 'settle') continue
    try {
      if (await deps.settlePost(d.postId, d.workspaceId, d.status)) report.settled += 1
      else report.blockedByGuard += 1
    } catch {
      report.failed += 1
    }
  }

  for (const d of decisions) {
    if (d.kind !== 'dispatch') continue
    for (const v of d.variants) {
      try {
        await deps.enqueuePublish({
          workspaceId: d.workspaceId,
          postId: d.postId,
          variantId: v.variantId,
          channel: v.channel,
          scheduledAt: v.scheduledAt,
        })
        report.enqueued += 1
      } catch (e) {
        if (isPublishQueueUnavailable(e)) report.queueUnavailable += 1
        else report.failed += 1
      }
    }
  }

  for (const d of decisions) {
    if (d.kind !== 'expire') continue
    try {
      if (await deps.expirePost(d.postId, d.workspaceId)) report.expired += 1
      else report.blockedByGuard += 1
    } catch {
      report.failed += 1
    }
  }

  return report
}

function summarize(d: DispatchDecision): DecisionSummary {
  switch (d.kind) {
    case 'dispatch':
      return { postId: d.postId, kind: d.kind, channels: d.variants.map((v) => v.channel) }
    case 'expire':
      return { postId: d.postId, kind: d.kind, reason: d.reason }
    case 'settle':
      return { postId: d.postId, kind: d.kind, status: d.status }
    case 'hold':
      return {
        postId: d.postId,
        kind: d.kind,
        reason: d.reason,
        publishedChannels: d.publishedChannels,
        unpublishedChannels: d.unpublishedChannels,
      }
  }
}
