import type { LeadStatus } from '@sahoda/shared'

/**
 * THE PIPELINE — four stages, and why not the five the column allows.
 *
 * `leads.status` CHECKs `new · contacted · qualified · won · lost`, applied to
 * production on 2026-07-18. The pipeline this product needs is four of those:
 *
 *     new → contacted → won → lost
 *
 * ── WHY `qualified` IS NOT ON THE BOARD ──────────────────────────────────────
 * These are shop owners, not sales teams. "Qualified" is a stage that exists so
 * a salesperson can report a number to a manager; a baker who has replied to
 * somebody either sells to them or does not. A fifth column would be a column
 * nobody ever moves a card into.
 *
 * ── AND WHY THE CHECK IS NOT NARROWED TO MATCH ───────────────────────────────
 * Narrowing an applied CHECK is forbidden here, and it would also be wrong: the
 * value is legal, and a future version of this product may use it. So
 * `qualified` stays a legal status that nothing writes and no column shows.
 *
 * There is deliberately NO "and qualified rows appear under Contacted" fold-in.
 * NO WRITER IN THIS CODEBASE EMITS `qualified` — `setLeadStatus` refuses it and
 * neither door produces it — so no such row can arrive through Sahoda, and UI
 * for it would be UI for a state nothing reaches. That is the claim, and it is
 * the whole claim: a row written by hand through the service role would carry
 * the value, and it would then appear in no column. Recorded rather than
 * papered over, because the alternative is dead UI, which `lib/billing/read.ts`
 * names as its own kind of dishonesty.
 */

export interface Stage {
  readonly status: Extract<LeadStatus, 'new' | 'contacted' | 'won' | 'lost'>
  readonly name: string
  /** What being in this column MEANS. Shown when the column is empty. */
  readonly what: string
}

export const STAGES: readonly Stage[] = [
  { status: 'new', name: 'New', what: 'Somebody left their details and nobody has answered yet.' },
  { status: 'contacted', name: 'Contacted', what: 'You replied. The clock is now on them.' },
  { status: 'won', name: 'Won', what: 'They bought, booked or walked in.' },
  { status: 'lost', name: 'Lost', what: 'They did not.' },
] as const

export const STAGE_STATUSES: readonly LeadStatus[] = STAGES.map((s) => s.status)

/** Is this a stage the board shows? A stored `qualified` is not. */
export function isBoardStatus(status: LeadStatus): status is Stage['status'] {
  return STAGE_STATUSES.includes(status)
}

/**
 * Where a lead moves next, in one press.
 *
 * `lost` is reachable from anywhere and is not on this path: losing one is not
 * the step after winning it.
 */
export function nextStatus(status: Stage['status']): Stage['status'] | null {
  if (status === 'new') return 'contacted'
  if (status === 'contacted') return 'won'
  return null
}
