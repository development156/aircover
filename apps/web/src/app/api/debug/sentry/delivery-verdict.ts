/**
 * Turns the two things we can actually observe locally into one honest verdict.
 *
 * WHY THIS IS NOT A ONE-LINER. The endpoint used to answer `sent:
 * Boolean(process.env.SENTRY_DSN)`, which proves a string is set and nothing
 * else — a revoked key or a wrong project id reported `sent: true` while Sentry
 * rejected every envelope. `Sentry.flush()` is a real signal instead of a
 * configuration echo, but only if you know precisely what its boolean means,
 * and it has two traps that make a bare `flushed` just as misleading. Both are
 * verified against @sentry/core 10.66.0, not assumed:
 *
 *  1. FLUSH TRUE DOES NOT IMPLY CONFIGURED. `Client.flush()` opens with
 *     `if (!transport) return true`, and the transport is only constructed when
 *     a DSN parses. So an unconfigured process flushes "successfully" in zero
 *     milliseconds. `configured` is what disambiguates it, which is why this
 *     module refuses to collapse the two booleans into one field.
 *
 *  2. FLUSH TRUE DOES NOT IMPLY ARRIVAL. `drain()` is
 *     `Promise.allSettled(buffer).then(() => true)` — settled, not fulfilled.
 *     A 403 from a revoked key, and even a network error, settle exactly like a
 *     202. So the strongest true claim is that the queue emptied: the envelope
 *     LEFT the process. Whether Sentry accepted it is knowable only in the
 *     Sentry UI, and the notes below are worded to stop exactly there.
 *
 * What `flushed: false` does prove is worth having: either no client was
 * initialised at all, or the queue was still full when the timeout expired. On
 * a serverless host that second case is the event that would have been dropped
 * when the lambda froze.
 */

export type DeliveryOutcome = 'drained' | 'not-drained' | 'not-configured'

export interface DeliverySignals {
  /** A DSN is set in this runtime — a trimmed, non-empty `SENTRY_DSN`. */
  readonly configured: boolean
  /** `Sentry.flush(timeout)` resolved true. */
  readonly flushed: boolean
}

export interface DeliveryVerdict extends DeliverySignals {
  readonly verdict: DeliveryOutcome
  /**
   * The single field a script or a human should branch on. True means the
   * envelope left the process; it never means Sentry stored it.
   */
  readonly ok: boolean
  readonly note: string
}

/**
 * Note the argument order of the checks: `configured` is tested FIRST, because
 * an unconfigured process reports `flushed: true` and testing flush first would
 * hand back a success verdict for a process that has no transport at all.
 */
export function deliveryVerdict({ configured, flushed }: DeliverySignals): DeliveryVerdict {
  if (!configured) {
    return {
      configured,
      flushed,
      verdict: 'not-configured',
      ok: false,
      note: 'Set SENTRY_DSN. With no DSN the client builds no transport, so flush resolves true without sending anything.',
    }
  }

  if (!flushed) {
    return {
      configured,
      flushed,
      verdict: 'not-drained',
      ok: false,
      note: 'The queue was still full when the timeout expired, or no client was initialised. On a serverless host this is the event that gets dropped when the function freezes.',
    }
  }

  return {
    configured,
    flushed,
    verdict: 'drained',
    ok: true,
    // Deliberately says "left the process", not "arrived". A 403 drains the
    // queue exactly like a 202 does — see the trap note above.
    note: 'The envelope left the process. Confirm the event id in the Sentry UI: a rejected envelope drains the queue exactly like a stored one.',
  }
}
