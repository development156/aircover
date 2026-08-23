/**
 * The sentence the delete confirmation shows.
 *
 * ── WHY THIS IS NOT IN `app/actions/knowledge.ts` ───────────────────────────
 * It was, and `app/actions/use-server-exports.test.ts` refused it. Every export
 * from a `'use server'` module becomes a callable server-action endpoint, so a
 * synchronous string formatter exported there is published as an RPC that
 * anyone who can reach the app can call. The guard is right and the fix is to
 * put a pure function where pure functions go.
 */

export interface DeleteImpact {
  /** Fields in the ACTIVE Brand Brain whose provenance names this document. */
  brandFields: number
  /** Proposals waiting on a decision that quote it. */
  pendingProposals: number
}

/**
 * Names what is affected, never a count on its own.
 *
 * "2 things will be affected" is a number a person cannot act on. What they need
 * to decide is whether the thing being broken matters — so the sentence says
 * WHICH thing, and then says plainly what deleting does and does not undo.
 * Deleting a document does NOT retract what the brain learned from it: a fact
 * the owner has confirmed is theirs, and silently unlearning it would be a
 * second and larger surprise.
 */
export function describeImpact(impact: DeleteImpact): string {
  const parts: string[] = []
  if (impact.brandFields > 0) {
    parts.push(
      `${impact.brandFields} ${impact.brandFields === 1 ? 'field' : 'fields'} in your Brand Brain came from this document`,
    )
  }
  if (impact.pendingProposals > 0) {
    parts.push(
      `${impact.pendingProposals} ${impact.pendingProposals === 1 ? 'suggestion' : 'suggestions'} waiting on you ${impact.pendingProposals === 1 ? 'quotes' : 'quote'} it`,
    )
  }
  if (parts.length === 0) return 'Nothing in your Brand Brain refers to this document.'

  return `${parts.join(', and ')}. Deleting it does not undo what Sahoda already learned. Those stay exactly as they are. What goes is the document behind them, so you will no longer be able to open the passage a field came from.`
}
