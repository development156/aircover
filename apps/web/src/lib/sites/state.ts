import type { ChargeFailureState } from '@/lib/posts/charge-failure'

/**
 * Site action state types. Kept out of the `'use server'` module that returns
 * them (LEARNINGS.md:21 — same rule as lib/posts/state.ts).
 */
export type GenerateSiteState =
  | {
      ok: true
      siteId: string
      slug: string
      /** Pages actually persisted — counted from returned rows, never assumed. */
      pages: number
      /** Sections/pages normalizeDraft had to drop — surfaced, never hidden. */
      dropped: number
      balanceAfter: number
      creditsCharged: number
    }
  | ChargeFailureState
