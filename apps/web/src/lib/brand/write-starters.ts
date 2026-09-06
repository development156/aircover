import 'server-only'

import { randomUUID } from 'node:crypto'

import type { BrandFieldMetaMap, BrandMemoryPayload } from '@sahoda/shared'
import { brandStartersTask, createMesh, type Mesh } from '@sahoda/mesh'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'

import { signalsForStarters } from './starters-signals'

/**
 * WRITE THE STUDIO STARTERS FOR A BRAND VERSION, ONCE, AND NEVER LOUDLY.
 *
 * ── FREE, SO THIS IS BEST-EFFORT LIKE `logo-facts-cache.ts`, NOT A CHARGE ────
 * The founder's ruling: no credit hold, no ledger entry, no `pricing.config.json`
 * line, folded into what resolving a Brand Brain already costs. A model call
 * with no hold needs its cost bounded by CONSTRUCTION instead of by a wallet:
 *
 *   1. It runs at most once per `(workspace_id, brand_version)`. The migration's
 *      `unique (workspace_id, brand_version)` is the backstop, never the plan —
 *      this checks for an existing row FIRST, so a version already served never
 *      pays for a second model call it would just throw away on conflict.
 *   2. It is called from here alone, the write path that just produced a
 *      version, and from nowhere that renders `/studio`. `starters-read.ts`
 *      only ever SELECTs.
 *   3. A failure anywhere in this function is caught, reported, and swallowed.
 *      The caller (`saveBrandMemory`) never learns this ran at all, exactly
 *      as `writeLogoFacts` never lets a caching failure reach a paid
 *      generation. The customer's Brand Brain save must succeed or fail on
 *      its own merits alone.
 */
export interface WriteBrandStartersInput {
  workspaceId: string
  brandVersion: number
  payload: BrandMemoryPayload
  fieldMeta: BrandFieldMetaMap | undefined
}

let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

export async function writeBrandStartersBestEffort(input: WriteBrandStartersInput): Promise<void> {
  try {
    const supabase = createServerSupabase()

    // CHECK FIRST. Never rely on the unique constraint as flow control: a
    // constraint violation would mean the model was already called and paid
    // for (in latency, if not in credits) before being thrown away.
    const existing = await supabase
      .from('brand_starters')
      .select('id')
      .eq('workspace_id', input.workspaceId)
      .eq('brand_version', input.brandVersion)
      .maybeSingle()

    // Any read failure — including `42P01`/`42703`/`PGRST205` from the table
    // being unapplied — means there is nothing to check and nothing safe to
    // write into either. Same answer as "already written": do nothing.
    if (existing.error) return
    if (existing.data) return

    const signals = signalsForStarters(input.payload, input.fieldMeta)
    const result = await getMesh().runTask(
      brandStartersTask.def,
      { signals },
      { workspaceId: input.workspaceId, traceId: randomUUID() },
    )
    if (!result.ok) {
      reportServerError(new Error(`brand_starters mesh call failed: ${result.error.message}`), {
        action: 'writeBrandStartersBestEffort',
        workspaceId: input.workspaceId,
      })
      return
    }

    const { error } = await supabase.from('brand_starters').insert({
      workspace_id: input.workspaceId,
      brand_version: input.brandVersion,
      starters: result.data.starters,
      model_id: result.usage?.model ?? null,
    })
    // `23505`: a concurrent write already landed for this exact version — the
    // unique constraint doing exactly the job it exists for. Anything else is
    // worth knowing about, but never worth failing the brain save over.
    if (error && error.code !== '23505') {
      reportServerError(error, {
        action: 'writeBrandStartersBestEffort.insert',
        workspaceId: input.workspaceId,
      })
    }
  } catch (error) {
    reportServerError(error, {
      action: 'writeBrandStartersBestEffort',
      workspaceId: input.workspaceId,
    })
  }
}
