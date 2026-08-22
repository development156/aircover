import { randomUUID } from 'node:crypto'

/**
 * LEDGER REFS FOR REMIX.
 *
 * ── WHY EACH ONE IS FRESH ────────────────────────────────────────────────────
 * `withCredits` keys exactly-once on `(action, objectRef)` and REUSES a
 * DEBIT-settled attempt, so a stable ref replays a spent charge: the paid model
 * call runs, the customer is not billed, and the ledger's account of itself has
 * a hole in it. Same reasoning as `lib/loop/object-ref.ts` and
 * `lib/planner/object-ref.ts`, where it is set out at length.
 *
 * ── AND WHY THE PREFIX IS ONE STRING ─────────────────────────────────────────
 * `remix:` is what a ledger query has to match to answer "what did this batch
 * cost". Nothing in SQL depends on it today — unlike the Loop, Remix has no kill
 * switch reading `object_ref like 'loop:%'` — so this is a reporting handle
 * rather than a safety mechanism, and it is stated here so it does not become
 * four different strings at four call sites.
 */

export const REMIX_REF_PREFIX = 'remix:'

/** Fresh ref for the once-per-run batch fee. */
export function newRemixBatchRef(batchId: string): string {
  return `${REMIX_REF_PREFIX}batch:${batchId}:${randomUUID()}`
}

/**
 * Fresh ref for one charge inside a run.
 *
 * A charge may cover SEVERAL derivatives — `content_variants` writes one variant
 * per channel from a single call — so the ref names the batch and the kind, not
 * one derivative. Naming a single derivative would suggest the other three were
 * free rather than covered.
 */
export function newRemixChargeRef(batchId: string, kind: string): string {
  return `${REMIX_REF_PREFIX}${kind}:${batchId}:${randomUUID()}`
}

export function isRemixRef(objectRef: string): boolean {
  return objectRef.startsWith(REMIX_REF_PREFIX)
}
