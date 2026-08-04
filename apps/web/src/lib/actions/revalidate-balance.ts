import { revalidatePath } from 'next/cache'

/**
 * Refresh everything that displays the credit balance after a paid action.
 *
 * The topbar credit chip is rendered in the app LAYOUT, so the page-scoped
 * `revalidatePath('/planner')`-style calls the paid actions already make never
 * touched it. Observed live: a 3-credit variant generation charged correctly
 * (ledger 50 → 47) while the chip kept reading 50 until a manual reload — the
 * user sees money leave with no visible effect, and clicking again is the
 * natural response.
 *
 * Call this whenever the balance MAY have moved — including the unconfirmed
 * (delivered-but-failed) path, where the debit may well have committed and the
 * user most needs to see the real number.
 *
 * Never throws: a revalidation failure must not change the action's outcome.
 */
export function revalidateBalance(): void {
  try {
    revalidatePath('/', 'layout')
    revalidatePath('/wallet')
  } catch {
    // Deliberately swallowed — see doc comment.
  }
}
