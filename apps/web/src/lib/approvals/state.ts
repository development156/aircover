import type { PostStatus } from '@sahoda/shared'

/**
 * The result of approving several posts at once.
 *
 * Kept out of the `'use server'` module that returns it — a `'use server'` file
 * may export only async functions (LEARNINGS.md:21).
 *
 * ── WHY THIS IS NOT `{ ok: boolean }` ────────────────────────────────────────
 * `approvePost` returns `{ ok: false }` when the RPC touches ZERO rows, and
 * that is BY DESIGN rather than an error: the allowlist lives in
 * `approve_posts` itself, so a post the publish pipeline picked up, or one
 * another tab approved a second earlier, matches nothing and is refused. One
 * at a time that reads correctly — "can't approve this from its current
 * state".
 *
 * In a loop it is the trap. Four succeed, one was already scheduled, and a
 * boolean forces a choice between claiming five approvals and claiming none.
 * Both are false, and "Approved" over a silent refusal is exactly the fabricated
 * success this codebase refuses everywhere else — the same shape as a mocked API
 * response, just smaller.
 *
 * ── WHY `approved` AND `scheduled` ARE TWO COUNTS ─────────────────────────────
 * Since `approve_posts` landed, approving a post that already carries a time
 * puts it straight on the calendar: the row comes back `scheduled`, not
 * `approved`. Those are different promises to the reader. "Approved" means
 * cleared and waiting for a time; "scheduled" means it goes out on its own.
 * Folding them into one number would print "3 approved" over a set that will
 * publish itself tonight, so the RPC's returned rows are counted by the status
 * they came back with.
 *
 * So the outcome is four counts, and the toast says each that is non-zero.
 * `partial` exists as a `PostStatus` for the identical reasoning one layer
 * down: a publish that went to one channel and not another is neither
 * published nor failed, and flattening it would tell someone their post did
 * not go out while it is live.
 */
export type BulkApproveState =
  | {
      ok: true
      /** Rows that came back `approved`: cleared, and still waiting for a time. */
      approved: number
      /** Rows that came back `scheduled`: they carried a time, so approving booked them. */
      scheduled: number
      /**
       * Selected, and no longer approvable when the RPC ran — already
       * approved, already scheduled, already picked up. Not a failure: the
       * screen was stale, and the remedy is to reload rather than to retry.
       */
      moved: number
      /** Selected, and the write itself errored. The remedy IS to retry. */
      failed: number
    }
  | { ok: false; message: string }

/** The sentence for ONE approved post, from the status the RPC handed back. */
export function approveMessage(status: PostStatus): string {
  if (status === 'scheduled') return 'Approved and scheduled.'
  return 'Approved. Give it a time and it goes out.'
}

/**
 * The sentence for a finished bulk run. One place, so the four counts agree.
 *
 * "Approved N" counts every row the RPC moved, dated or not; "M are now
 * scheduled" names the subset that will go out on its own. A count of zero
 * drops its part rather than printing "0 are now scheduled".
 */
export function bulkApproveMessage(state: Extract<BulkApproveState, { ok: true }>): string {
  const cleared = state.approved + state.scheduled
  const parts: string[] = []
  if (cleared > 0) {
    parts.push(`Approved ${cleared}.`)
  }
  if (state.scheduled > 0) {
    parts.push(`${state.scheduled} ${state.scheduled === 1 ? 'is' : 'are'} now scheduled.`)
  }
  if (state.moved > 0) {
    // Never "failed". Nothing went wrong; the list was out of date.
    parts.push(`${state.moved} had already moved on.`)
  }
  if (state.failed > 0) {
    parts.push(`${state.failed} could not be saved.`)
  }
  if (parts.length === 0) return 'Nothing was selected, so nothing changed.'
  return parts.join(' ')
}
