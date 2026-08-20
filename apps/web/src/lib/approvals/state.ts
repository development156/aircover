/**
 * The result of approving several posts at once.
 *
 * Kept out of the `'use server'` module that returns it — a `'use server'` file
 * may export only async functions (LEARNINGS.md:21).
 *
 * ── WHY THIS IS NOT `{ ok: boolean }` ────────────────────────────────────────
 * `approvePost` returns `{ ok: false }` when its update matches ZERO rows, and
 * that is BY DESIGN rather than an error: the allowlist rides in the SQL, so a
 * post the publish pipeline picked up, or one another tab approved a second
 * earlier, matches nothing and is refused. One at a time that reads correctly —
 * "can't approve this from its current state".
 *
 * In a loop it is the trap. Four succeed, one was already scheduled, and a
 * boolean forces a choice between claiming five approvals and claiming none.
 * Both are false, and "Approved" over a silent refusal is exactly the fabricated
 * success this codebase refuses everywhere else — the same shape as a mocked API
 * response, just smaller.
 *
 * So the outcome is three counts, and the toast says all three. `partial` exists
 * as a `PostStatus` for the identical reasoning one layer down: a publish that
 * went to one channel and not another is neither published nor failed, and
 * flattening it would tell someone their post did not go out while it is live.
 */
export type BulkApproveState =
  | {
      ok: true
      /** Rows that actually transitioned. Counted from returned rows, never assumed. */
      approved: number
      /**
       * Selected, and no longer approvable when the update ran — already
       * approved, already scheduled, already picked up. Not a failure: the
       * screen was stale, and the remedy is to reload rather than to retry.
       */
      moved: number
      /** Selected, and the write itself errored. The remedy IS to retry. */
      failed: number
    }
  | { ok: false; message: string }

/** The sentence for a finished bulk run. One place, so the three counts agree. */
export function bulkApproveMessage(state: Extract<BulkApproveState, { ok: true }>): string {
  const parts: string[] = []
  if (state.approved > 0) {
    parts.push(`${state.approved} approved`)
  }
  if (state.moved > 0) {
    // Never "failed". Nothing went wrong; the list was out of date.
    parts.push(`${state.moved} had already moved on`)
  }
  if (state.failed > 0) {
    parts.push(`${state.failed} could not be saved`)
  }
  if (parts.length === 0) return 'Nothing was selected, so nothing changed.'
  return parts.join(' · ')
}
