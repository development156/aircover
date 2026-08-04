import { randomUUID } from 'node:crypto'

/**
 * Ledger idempotency namespaces for the two paid post actions. **Server-derived
 * only** — mirrors `newResolveObjectRef`, and for the same reason.
 *
 * `withCredits` keys exactly-once on `(action, objectRef)`, and billing's
 * `nextAttempt()` deliberately REUSES the attempt when the previous one settled
 * by DEBIT (its lost-ack protection, `withCredits.ts:136-139`). So a *stable*
 * ref — `posts.id`, say — would not be idempotency, it would be a free-call
 * hole: the second "Generate variants" on the same post replays the spent HOLD
 * and DEBIT (charging nothing) while the paid mesh call still runs. billing's
 * own contract comment states the rule — "to charge again, the caller passes a
 * fresh objectRef".
 *
 * Both actions are re-triggerable by design, so both mint a fresh ref per
 * invocation. Neither takes a parameter a request body can reach; the client's
 * pending-state guard is what prevents an accidental double submit.
 */
function newRef(namespace: string, workspaceId: string): string {
  return `${workspaceId}:${namespace}:${randomUUID()}`
}

/** Fresh ref for one `post_variants` charge (3 credits). */
export function newVariantsObjectRef(workspaceId: string): string {
  return newRef('variants', workspaceId)
}

/** Fresh ref for one `caption_rewrite` charge (1 credit). */
export function newCaptionRewriteRef(workspaceId: string): string {
  return newRef('rewrite', workspaceId)
}
