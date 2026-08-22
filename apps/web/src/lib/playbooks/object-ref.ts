import { randomUUID } from 'node:crypto'

/**
 * LEDGER REFS FOR PLAYBOOKS — and the one prefix the kill switch depends on.
 *
 * `public.playbook_kill_switch` finds outstanding holds with
 *
 *     where object_ref like 'playbook:%'
 *
 * so a Playbook charge written with any other ref is a hold the kill switch
 * CANNOT SEE. That is the precise case the switch exists for — a run in flight
 * when someone presses the button — so a charge that opts out of the prefix by
 * accident defeats the feature silently and nothing anywhere would report it.
 *
 * Every ref therefore comes from this file, and `object-ref.test.ts` pins the
 * prefix against the literal the SQL uses.
 *
 * ── AND WHY EACH ONE IS FRESH ────────────────────────────────────────────────
 * `withCredits` keys exactly-once on `(action, objectRef)` and REUSES a
 * DEBIT-settled attempt, so a stable ref replays the spent charge: the paid model
 * call runs and the customer is not billed. That is a free generation and a hole
 * in the ledger's account of itself.
 */

/** Character-identical to the pattern in `20260822030100_playbook_rpcs.sql`. */
export const PLAYBOOK_REF_PREFIX = 'playbook:'

/** Fresh ref for the per-run charge. */
export function newPlaybookRunRef(runId: string): string {
  return `${PLAYBOOK_REF_PREFIX}run:${runId}:${randomUUID()}`
}

/** Fresh ref for one item's drafting charge. */
export function newPlaybookItemRef(itemId: string): string {
  return `${PLAYBOOK_REF_PREFIX}item:${itemId}:${randomUUID()}`
}

/**
 * Whether a ref is one the kill switch would find. Exported so the assertion can
 * be made at the CHARGE site rather than only in a test — a caller that builds a
 * ref some other way is refused before the hold is taken.
 */
export function isPlaybookRef(objectRef: string): boolean {
  return objectRef.startsWith(PLAYBOOK_REF_PREFIX)
}
