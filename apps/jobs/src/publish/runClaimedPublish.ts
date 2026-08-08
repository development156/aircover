import type { PublishPostPayload } from '@sahoda/shared'
import { runPublishPost, type PublishJobContext, type PublishOutcome } from './runPublishPost'
import type { PublishPostDeps } from './runPublishPost'

/**
 * How long a claim is honoured before its holder is presumed dead.
 *
 * Sized against the two things it sits between:
 *   · LONGER than any single publish can take. The publish-now route caps at 120s
 *     and the Instagram poll alone is 36s, so a live publisher must never have its
 *     row stolen mid-flight.
 *   · Rarely reached at all, because the normal transient path releases explicitly
 *     the moment the failure is classified. This number only governs the case
 *     where the process was killed and could not release anything.
 *
 * Ten minutes is comfortably clear of the first and, being the crash-only path,
 * costs nothing in the common case.
 */
export const PUBLISH_LEASE_SECONDS = 600

/** Why a run did nothing, when it did nothing. */
export type ClaimRefusal = 'already-claimed'

/**
 * The infrastructure under a publish failed before the publish could be recorded.
 *
 * ── WHY THIS CLASS EXISTS ────────────────────────────────────────────────────
 * "Nothing publishes without a post_publish_logs row" (apps/jobs/CLAUDE.md) holds for
 * every failure INSIDE runPublishPost — each path writes its row first. It cannot hold
 * for a failure that happens before then, because the row is itself a Postgres write:
 * when the database is what is unreachable, there is nowhere to record that it is.
 *
 * That gap is not theoretical. On 2026-08-07 four publishes returned 503 with no log
 * row at all, and the logs could not say why — the 503 was anonymous, so it was
 * indistinguishable from an adapter timeout. The database was the cause
 * (SUPABASE_DB_URL pointed at the IPv6-only direct host), and `claimVariant` is the
 * first statement that touches it.
 *
 * So the failure is CLASSIFIED at its source instead. The stage travels out to the
 * caller, which can name it in the response and attach it to Sentry — the diagnosis
 * survives even though no row can be written.
 */
export type PublishInfraStage = 'deps' | 'claim' | 'release'

export class PublishInfraError extends Error {
  readonly stage: PublishInfraStage

  constructor(stage: PublishInfraStage, cause: unknown) {
    super(
      `publish infrastructure unavailable at ${stage}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
    this.name = 'PublishInfraError'
    this.stage = stage
    this.cause = cause
  }
}

export type ClaimedPublishResult =
  | { claimed: true; outcome: PublishOutcome }
  /** Someone else owns this variant, or it is already published. Not an error. */
  | { claimed: false; reason: ClaimRefusal }

export interface ClaimedPublishDeps extends PublishPostDeps {
  claimVariant(payload: PublishPostPayload, leaseSeconds: number): Promise<boolean>
  releaseVariant(payload: PublishPostPayload): Promise<void>
  leaseSeconds?: number
}

/**
 * Publish one variant, at most once, whoever else is trying at the same time.
 *
 * ── WHY THIS WRAPPER EXISTS SEPARATELY FROM runPublishPost ───────────────────
 * `runPublishPost` is the publish; this is the concurrency control around it, and
 * keeping them apart matters because they answer to different owners. The job core
 * is pure enough to unit-test with no database at all. The claim is inherently a
 * database fact — a single atomic UPDATE — and cannot be anything else.
 *
 * ── THE THREE EXITS, AND WHY THE VARIANT ENDS SOMEWHERE HONEST IN EACH ───────
 *  1. Not claimed. Another worker holds it, or it has already published. Nothing
 *     is written and nothing is reported as failed, because nothing was attempted.
 *  2. Terminal (published or permanently failed). `runPublishPost` has already
 *     written the log row and set the variant, and `markVariant` clears the claim
 *     as part of that same statement.
 *  3. Transient. `runPublishPost` rethrows on purpose so a durable runner can
 *     retry, and deliberately leaves the variant alone — the attempt is not over.
 *     Left as-is the row would sit `publishing` for the whole lease. So the claim
 *     is handed back HERE, before the rethrow, and the next tick can pick it up
 *     immediately.
 *
 * The release is in a `catch` rather than a `finally` on purpose: a `finally`
 * would also run on the terminal paths and undo the terminal state `markVariant`
 * just wrote, turning a permanently-failed variant back into a scheduled one.
 */
export async function runClaimedPublish(
  payload: PublishPostPayload,
  ctx: PublishJobContext,
  deps: ClaimedPublishDeps,
): Promise<ClaimedPublishResult> {
  const lease = deps.leaseSeconds ?? PUBLISH_LEASE_SECONDS

  // The FIRST statement that touches Postgres. A throw here is the database being
  // unreachable, not a publish failing — and it must not be reported as one. Nothing
  // has been claimed, so nothing needs releasing.
  let claimed: boolean
  try {
    claimed = await deps.claimVariant(payload, lease)
  } catch (e) {
    throw new PublishInfraError('claim', e)
  }
  if (!claimed) return { claimed: false, reason: 'already-claimed' }

  try {
    return { claimed: true, outcome: await runPublishPost(payload, ctx, deps) }
  } catch (error) {
    // Best-effort. A failed release is not worth converting a retryable publish
    // failure into a different error — the lease still frees the row either way.
    try {
      await deps.releaseVariant(payload)
    } catch {
      /* the lease is the backstop */
    }
    throw error
  }
}
