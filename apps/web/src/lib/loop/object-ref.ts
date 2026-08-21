import { randomUUID } from 'node:crypto'

/**
 * LEDGER REFS FOR THE LOOP — and the one prefix the kill switch depends on.
 *
 * ── WHY THIS IS A MODULE AND NOT TWO TEMPLATE STRINGS AT THE CALL SITES ──────
 * `public.loop_kill_switch` finds outstanding holds with
 *
 *     where object_ref like 'loop:%'
 *
 * so a Loop charge written with any other ref is a hold the kill switch CANNOT
 * SEE. That is the precise case the kill switch exists for — a create stage in
 * flight when someone presses the button — so a charge that opts out of the
 * prefix by accident defeats the feature silently, and nothing anywhere would
 * report it.
 *
 * Every Loop ref therefore comes from this file, and `object-ref.test.ts` pins
 * the prefix against the literal the SQL uses. Delete the prefix and the test
 * goes red; that is what makes it a guard rather than a convention.
 *
 * ── AND WHY EACH ONE IS FRESH ────────────────────────────────────────────────
 * `withCredits` keys exactly-once on `(action, objectRef)` and REUSES a
 * DEBIT-settled attempt, so a stable ref replays the spent charge — the paid
 * model call runs and the customer is not billed, which is a free generation and
 * a hole in the ledger's account of itself. Same reasoning as
 * `lib/planner/object-ref.ts`, where it is set out at length.
 */

/**
 * The prefix every Loop ledger ref carries. Character-identical to the pattern
 * in `20260820000400_loop_rpcs.sql`. If you change one, change both — and the
 * test will tell you if you changed only one.
 */
export const LOOP_REF_PREFIX = 'loop:'

/** Fresh ref for the 20-credit orchestration charge of one cycle. */
export function newLoopCycleRef(cycleId: string): string {
  return `${LOOP_REF_PREFIX}cycle:${cycleId}:${randomUUID()}`
}

/** Fresh ref for one brief's creation charge inside the create stage. */
export function newLoopBriefRef(briefId: string): string {
  return `${LOOP_REF_PREFIX}brief:${briefId}:${randomUUID()}`
}

/**
 * Whether a ref is one the kill switch would find.
 *
 * Exported so the assertion can be made at the CHARGE site rather than only in a
 * test — a caller that builds a ref some other way is refused before the hold is
 * taken, instead of producing an invisible one.
 */
export function isLoopRef(objectRef: string): boolean {
  return objectRef.startsWith(LOOP_REF_PREFIX)
}
