import type { PostStatus } from '@sahoda/shared'

import type { ChargeFailureState } from '@/lib/posts/charge-failure'

/**
 * Planner action state types. Kept out of the `'use server'` modules that
 * return them — a `'use server'` file may export only async functions
 * (LEARNINGS.md:21, same rule as lib/posts/state.ts).
 */

export type PlanWeekState =
  | {
      ok: true
      /** Drafts actually inserted — counted from the returned rows, not assumed. */
      created: number
      /** How many model slots were unusable and replaced by deterministic fallbacks. */
      clamped: number
      /** The drafts, in the order they were planned, so a follow-up can picture each one. */
      postIds: string[]
      balanceAfter: number
      creditsCharged: number
    }
  | ChargeFailureState

export type ApproveState = { ok: true; status: PostStatus } | { ok: false; message: string }
