import type { Channel } from '../enums'
import type { GateVerdict } from './rules'

/**
 * The port `runPublishPost` depends on. The implementation (database reads, the
 * model call, the audit write) lives in apps/jobs; the CONTRACT lives here so
 * the publish core stays unit-testable with no database and no model, exactly
 * as every other dep on `PublishPostDeps` already is.
 */

export interface GateCheckInput {
  workspaceId: string
  /**
   * The post id, and it is the TRUSTWORTHY identifier of the two.
   *
   * `workspaceId` reaches the publisher as ordinary payload data across a queue
   * and nothing re-checks it (see `loadConnection` in apps/jobs/src/publish/
   * store.ts, which is why instagram resolves through
   * `assert_account_for_scheduled_post` instead). A gate that loaded red lines
   * by the payload's workspace could judge one brand's post against another
   * brand's rules — and the failure direction is the bad one: it PASSES things
   * that should have been refused. The store therefore joins `brand_memory`
   * through `posts` by post id. `workspaceId` is carried for the audit row only.
   */
  postId: string
  variantId: string
  channel: Channel
  /** The body as it will be sent, after `formatForPlatform` has had its say. */
  text: string
  /**
   * The run that caused this publish — `web:<uuid>` when a person pressed
   * Publish, `cron:<postId>` when the sweep did.
   *
   * It is the audit row's `actor` AND its `trace_id`, and reusing one value for
   * both is deliberate: `post_publish_logs.job_run_id` already carries it, so
   * the gate decision and the publish attempt it governed can be joined without
   * anyone having to correlate timestamps.
   *
   * Read the name honestly — this identifies the RUN, not an approver. Nothing
   * in the schema records who approved a post (`approvePost` writes only
   * `{ status: 'approved' }`), so doc 18 §8's "who approved" is a gap that this
   * field must not be quietly used to paper over.
   */
  jobRunId: string
}

/**
 * Check one variant before it can be published.
 *
 * MUST NOT THROW. Every failure mode — the brain unreadable, the model down,
 * the audit write refused — resolves to a `hold` verdict, because a gate that
 * throws is a gate whose caller has to decide what an exception means, and the
 * tempting answer at that call site is always "carry on".
 */
export interface PublishGate {
  check(input: GateCheckInput): Promise<GateVerdict>
}
