import { ZernioError } from '@sahoda/publishing'

/**
 * What a failed unit of reconciliation is allowed to say about itself.
 *
 * ── WHY A CLASSIFICATION AND NOT THE ERROR ───────────────────────────────────
 * The sweep's report is returned whole by `apps/web`'s cron route, and that route
 * answers a public URL. `run-sweeps.ts` already carries the rule this module
 * obeys: a failure is NAMED, never described, "since a database error message can
 * carry a connection string, a host or a query". `pool.query` throwing is exactly
 * that case — its message routinely contains the host it could not reach.
 *
 * So nothing here reads `error.message`. A `ZernioError` contributes its own short
 * code and HTTP status, both of which the API defines and neither of which is
 * free-form; everything else contributes a class-level token and nothing more.
 *
 * The error itself is not thrown away — `ReconcileSweepDeps.onFailure` receives it
 * intact, so the caller can send it to Sentry where a message belongs.
 */

/** Thrown when the Zernio rail has no API key here. Not a fault of the platform's. */
export class ZernioNotProvisionedError extends Error {
  constructor() {
    super('Zernio is not provisioned in this environment')
    this.name = 'ZernioNotProvisionedError'
  }
}

/** Which half of the pass a failure came from. */
export type ReconcileScope = 'connection' | 'publish'

/** Which side of one unit failed: asking the platform, or writing our own row. */
export type ReconcileStage = 'read' | 'write'

/** One kind of failure, and how many times it happened this pass. */
export interface ReconcileFailure {
  scope: ReconcileScope
  stage: ReconcileStage
  /** A short token. Never a message. */
  code: string
  /** The provider's HTTP status when there was one. */
  status: number | null
}

export interface CountedReconcileFailure extends ReconcileFailure {
  count: number
}

/** What `onFailure` is handed. The only place the real error survives. */
export interface ReconcileFailureEvent extends ReconcileFailure {
  /** The untouched cause, for a logger that is allowed to see it. */
  error: unknown
}

/**
 * A provider code we are willing to repeat.
 *
 * Zernio's envelope carries a short constant (`RATE_LIMITED`, `INVALID_PROFILE_ID`),
 * but the field is theirs and this string ends up in a response body of ours. Anything
 * that is not a short token — a sentence, a URL, a stack — is replaced rather than
 * truncated, because half of a leaked host is still a leaked host.
 */
const SAFE_CODE = /^[A-Za-z0-9_.-]{1,48}$/

/**
 * What may be said publicly about one failure.
 *
 * The stage is the caller's knowledge, not the error's: only the sweep knows whether
 * the call that threw was a read or a write, and a `pool.query` failure looks identical
 * either way.
 */
export function classifyFailure(
  stage: ReconcileStage,
  error: unknown,
): { code: string; status: number | null } {
  if (error instanceof ZernioNotProvisionedError) return { code: 'not-provisioned', status: null }
  if (error instanceof ZernioError) {
    return { code: SAFE_CODE.test(error.code) ? error.code : 'zernio-error', status: error.status }
  }
  // Everything else is ours: a pool that would not connect, a constraint, a bug. The
  // stage is all that can be said honestly without opening the message.
  return { code: stage === 'write' ? 'write-failed' : 'read-failed', status: null }
}

/**
 * Fold one failure into the running list, merging it with an identical earlier one.
 *
 * Aggregated rather than listed per row for two reasons: a 25-row batch that fails the
 * same way should read as one fact with a count, and a per-row list would want row ids
 * to be useful — which is the one thing this body may not carry.
 */
export function recordFailure(
  failures: CountedReconcileFailure[],
  scope: ReconcileScope,
  stage: ReconcileStage,
  error: unknown,
): void {
  const { code, status } = classifyFailure(stage, error)
  const existing = failures.find(
    (f) => f.scope === scope && f.stage === stage && f.code === code && f.status === status,
  )
  if (existing) {
    existing.count += 1
    return
  }
  failures.push({ scope, stage, code, status, count: 1 })
}
