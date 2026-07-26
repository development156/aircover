/**
 * Thrown by an `enqueuePublish` that has nowhere to put the work.
 *
 * This is not a failure of a publish — nothing was attempted, no platform was called, no
 * log row was written. It exists so a deployment that can sweep but cannot publish says
 * so plainly rather than either pretending to enqueue or reporting a publish error that
 * never happened. The sweep counts it under its own name for the same reason
 * `HOLD_ALREADY_SETTLED` is counted apart from `failed` in the hold sweep: a correct
 * refusal and a broken thing must not share a number.
 *
 * The Vercel-cron deployment throws this on every dispatch decision, by design: there is
 * no queue behind it, and no CAS claim on post_variants to make an inline publish safe
 * when two cron invocations overlap. Publishing stays disabled until that claim exists.
 */
export class PublishQueueUnavailableError extends Error {
  readonly code = 'PUBLISH_QUEUE_UNAVAILABLE'

  constructor(message = 'No publish queue is wired: this deployment cannot publish.') {
    super(message)
    this.name = 'PublishQueueUnavailableError'
  }
}

/**
 * Duck-typed on purpose. `instanceof` is the common case, but a payload that crossed a
 * module boundary (or a bundler that produced two copies of this class) would fail that
 * check and get miscounted as a failure — the exact confusion this distinction exists to
 * prevent. Mirrors `isAlreadySettled` in the hold sweep.
 */
export function isPublishQueueUnavailable(e: unknown): boolean {
  if (e instanceof PublishQueueUnavailableError) return true
  return (e as { code?: unknown } | null)?.code === 'PUBLISH_QUEUE_UNAVAILABLE'
}
