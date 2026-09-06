import 'server-only'

import type { BrandSignal } from '@sahoda/shared'
import { BrandStarterIdeasSchema } from '@sahoda/shared'

import { readBrain } from '@/lib/brand/read-brain'
import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

import type { PromptStarter } from './prompt'
import { combineStudioStarters, type StudioStarters } from './starter-ladder'

export type { StarterSource, StudioStarters } from './starter-ladder'
export { combineStudioStarters }

/**
 * Codes that mean "this deploy's schema does not have this yet," never "the
 * read failed." MEASURED in `lib/billing/read.ts` against the live project:
 * a missing TABLE never reaches Postgres at all (PostgREST resolves table
 * names from its own schema cache first) and answers `PGRST205`; a missing
 * COLUMN does reach Postgres and answers `42703`; `42P01` is the direct-SQL
 * spelling of the same "no such table" fact. `brand_starters` is unapplied
 * today, so this set is exactly the set of answers a healthy call to this
 * function can get back — none of them may reach the screen as an error.
 */
const NOT_DEPLOYED = new Set(['PGRST205', '42703', '42P01'])

/**
 * Step 1 alone: the stored row for the given brand version, or null for every
 * other case (no row, a stale version, an unapplied table, a read that failed
 * outright, a row that will not parse). Exported separately so a test can
 * drive each of those cases without going through `readBrain()` at all.
 */
export async function readStoredStarters(
  workspaceId: string,
  brandVersion: number,
): Promise<readonly PromptStarter[] | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('brand_starters')
      .select('starters')
      // A row for a DIFFERENT brand_version is a stale one and must not be
      // served — this filter, not a later comparison, is what keeps a
      // re-resolved brain from describing itself as it used to be.
      .eq('workspace_id', workspaceId)
      .eq('brand_version', brandVersion)
      .maybeSingle()

    if (error) {
      if (!NOT_DEPLOYED.has(error.code ?? '')) {
        console.error('[studio] stored starters read failed', error.code, error.message)
      }
      return null
    }
    if (!data) return null

    const parsed = BrandStarterIdeasSchema.safeParse(data.starters)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Step 1, resolved against whichever brand version is currently active.
 *
 * Exported so a page that already fires several independent reads in one
 * `Promise.all` — as `/studio`'s own does for its recent generations, its
 * library and its brand signals — can run this one alongside them instead of
 * waiting for those first and paying its round trip serially afterwards.
 * `combineStudioStarters` (`./starter-ladder`) is the pure other half,
 * applied once every promise in that batch has settled.
 */
export async function readStoredStartersForActiveBrand(): Promise<readonly PromptStarter[] | null> {
  const brain = await readBrain()
  if (brain.status !== 'ok') return null

  const active = await activeWorkspaceRead()
  if (active.status !== 'ok') return null

  return readStoredStarters(active.workspace.id, brain.version)
}

/**
 * The whole ladder in one call, for a caller that has no other reads to run
 * alongside it. Never throws, never calls a model. `/studio`'s own page does
 * NOT use this — it runs `readStoredStartersForActiveBrand()` inside its
 * existing `Promise.all` and calls `combineStudioStarters` once everything
 * has settled, so the one indexed lookup this needs races the page's other
 * reads instead of following them.
 */
export async function resolveStudioStarters(
  signals: readonly BrandSignal[] | null,
): Promise<StudioStarters> {
  const stored = await readStoredStartersForActiveBrand()
  return combineStudioStarters(stored, signals)
}
