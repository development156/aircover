import type { BrandSignal } from '@sahoda/shared'

import { buildPromptStarters, PROMPT_STARTERS, type PromptStarter } from './prompt'

/**
 * THE THREE-STEP LADDER `/studio` READS ITS STARTERS THROUGH.
 *
 * Pure and client-safe (no `server-only`, no I/O) so both the server read
 * (`starters-read.ts`) and the composer (`composer.tsx`, a client component)
 * can share one definition of what each step means, rather than the client
 * re-declaring its own shape for the same three facts.
 *
 * Each step is a different fact and a caller is handed which one it got, the
 * same discipline `buildPromptStarters` already uses for its own two-way
 * `source`:
 *
 *   1. `stored`  — a model wrote these FOR this exact brand version. The good
 *                  case, from `brand_starters` (written once by
 *                  `apps/web/src/lib/brand/write-starters.ts`, never from a
 *                  read).
 *   2. `brand`   — no stored row (not written yet, or the table is not
 *                  applied on this deploy), so `buildPromptStarters` folds
 *                  whatever the Brand Brain holds into the generic five's own
 *                  frames. Better than nothing, honestly labelled as less.
 *   3. `generic` — nothing in the brain either. `PROMPT_STARTERS`, unchanged.
 */
export type StarterSource = 'stored' | 'brand' | 'generic'

export interface StudioStarters {
  readonly starters: readonly PromptStarter[]
  readonly source: StarterSource
}

/**
 * Steps 2 and 3, combined exactly as `buildPromptStarters` already tells them
 * apart via its own `source`.
 *
 * Labels for the brand-derived sentences borrow `PROMPT_STARTERS`' own five
 * chip labels, positionally: `buildPromptStarters`'s own header states it
 * writes "the same five lessons `PROMPT_STARTERS` was written to teach," in
 * the same order, so pairing them index-for-index is the same idea's label,
 * not a different one.
 */
function fallbackStarters(signals: readonly BrandSignal[] | null): StudioStarters {
  const built = buildPromptStarters(signals ?? [])
  return {
    starters: built.starters.map((prompt, i) => ({
      label: PROMPT_STARTERS[i]?.label ?? prompt.slice(0, 40),
      prompt,
    })),
    source: built.source,
  }
}

/**
 * The whole ladder, given step 1's already-settled answer. No I/O: a server
 * page calls this once its `Promise.all` (which carries the stored-starters
 * lookup as one of its own entries) has resolved; a client component that
 * received no stored answer at all calls it with `stored: null` to get steps
 * 2 and 3 on its own, from the same `signals` it already renders with.
 */
export function combineStudioStarters(
  stored: readonly PromptStarter[] | null,
  signals: readonly BrandSignal[] | null,
): StudioStarters {
  if (stored !== null) return { starters: stored, source: 'stored' }
  return fallbackStarters(signals)
}
