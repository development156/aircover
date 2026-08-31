import type { Channel } from '@sahoda/shared'

/**
 * THE TEN ARGUMENTS OF `WRITE_DECISION_SQL`, BUILT IN ONE PLACE.
 *
 * ── WHY THIS IS NOT INLINE IN `store.ts` ─────────────────────────────────────
 * That statement takes ten positional parameters and FIVE of them are uuid
 * strings: workspace, post, variant, brief and cycle. TypeScript sees one type
 * for all five, so swapping any two compiles, passes every unit test, and
 * writes a row that names the wrong brief. `loop_autopilot_log` refuses UPDATE
 * and DELETE, so a row written wrong is wrong permanently — the table exists to
 * answer "what went out and who decided", and a silently mis-bound argument
 * makes it answer confidently and falsely.
 *
 * Everything either side of that binding was proven and the binding itself was
 * not: the pglite suite drove the statement with its own hand-written array,
 * and `store.ts` built a different array from an object. Two correct halves,
 * untested seam. That is the shape of the kill-switch defect found earlier on
 * this branch and of the row-mapper gap closed after it.
 *
 * With the array built here, the pglite suite binds through the SAME code the
 * dispatcher uses and reads the columns back out of a real Postgres, so a swap
 * lands in a database rather than in a type that cannot see it.
 *
 * ── WHY A LEAF, IMPORTING ONLY `@sahoda/shared` ──────────────────────────────
 * `packages/db`'s tsconfig has no `@/` alias, so anything the pglite suite
 * imports must not chain into the decision modules. `Channel` comes from the
 * shared package, which both sides already depend on.
 */
export interface DecisionParams {
  workspaceId: string
  postId: string
  variantId: string
  channel: Channel
  accountId: string
  briefId?: string | null
  cycleId?: string | null
  decision: 'announced' | 'dispatched' | 'refused' | 'cancelled'
  refusalReason?: string | null
  dispatchAfter?: Date | string | null
}

/**
 * Nothing is defaulted into a value. The four identifying columns are NOT NULL
 * with a CHECK in the migration, and the two conditional constraints (an
 * announcement has a window; a refusal names its guardrail) are CHECKs too.
 * An absent optional becomes `null` so the database still refuses the row —
 * softening any of them here would move the guard out of the database and into
 * a file the next caller does not inherit.
 */
export function decisionParams(row: DecisionParams): unknown[] {
  return [
    row.workspaceId,
    row.postId,
    row.variantId,
    row.channel,
    row.accountId,
    row.briefId ?? null,
    row.cycleId ?? null,
    row.decision,
    row.refusalReason ?? null,
    isoOrNull(row.dispatchAfter),
  ]
}

/**
 * The window as the column wants it, without inventing one that is absent.
 *
 * MEASURED, and said because a guard never shown to fail is not a guard:
 * replacing the Date branch with a bare cast leaves every test GREEN. Both
 * PGlite and node-postgres serialise a Date for a timestamptz themselves, so
 * nothing observable depends on this call. It stays because it makes the value
 * crossing the boundary explicit and because it is what `store.ts` did before
 * the array moved here, NOT because a test is watching it. The two lines above
 * it are watched: turning an absent window or an absent reason into a value
 * turns tests red, which is the part that matters.
 */
function isoOrNull(at: Date | string | null | undefined): string | null {
  if (at === null || at === undefined) return null
  return at instanceof Date ? at.toISOString() : at
}
