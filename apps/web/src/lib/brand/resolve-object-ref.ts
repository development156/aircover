import { randomUUID } from 'node:crypto'

/**
 * The ledger idempotency namespace for a paid resolve. **Server-derived only.**
 *
 * `withCredits` keys exactly-once on `(action, objectRef)`, and billing's
 * `nextAttempt()` deliberately REUSES the attempt when the previous one settled
 * by DEBIT (its lost-ack protection). A client-supplied value here would
 * therefore let any signed-in caller replay a spent key: the HOLD and DEBIT both
 * replay while the wrapped fn still runs — an unlimited number of paid
 * `brand_guidelines` calls for a single 50-credit charge. So this takes ONLY a
 * workspace id; there is deliberately no parameter a request body can reach.
 *
 * Each invocation is a distinct, intended charge. TODO: once a resolve is
 * persisted, bind the ref to the active `brand_memory` version so a genuine
 * lost-ack retry replays instead of re-charging (today the client's pending-state
 * guard is what prevents a double submit).
 */
export function newResolveObjectRef(workspaceId: string): string {
  return `${workspaceId}:${randomUUID()}`
}
