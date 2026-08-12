import 'server-only'

import { cache } from 'react'
import {
  StoredBrandMemorySchema,
  type BrandFieldMetaMap,
  type BrandIntake,
  type BrandMemoryPayload,
} from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

import { provenanceOf, type Provenance } from './provenance'

/**
 * Brand Brain reads. `brand_memory` carries a member-SELECT policy only (writes go
 * through `public.resolve_brand_memory`), and that policy filters on
 * `workspace_id` alone.
 *
 * Every read is filtered to the ACTIVE workspace. As in the wallet reads, this is
 * a CORRECTNESS filter and not an authorization check: the member policy admits
 * every workspace the user belongs to, so without it a second membership could
 * surface another brand's brain.
 *
 * This used to select EVERY version, because provenance was reconstructed by
 * diffing the history. It now reads the active row alone: `field_meta` on that
 * row says what each field's provenance is, so the superseded versions are no
 * longer evidence about anything on this page.
 */

const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const workspace = await getActiveWorkspace()
  return workspace?.id ?? null
})

/**
 * Four answers, four different remedies — the same discipline `BalanceRead` uses.
 *
 *  - `ok`            we read it.
 *  - `no-workspace`  no workspace, so no brain to read. Remedy: create one.
 *  - `no-brain`      a workspace with no Brand Brain yet. Remedy: onboarding.
 *                    NOT an error, and never rendered as an empty or 0% brain.
 *  - `unreadable`    the read failed. Remedy: reload.
 *
 * Collapsing `no-brain` into `unreadable` would tell every new workspace that
 * something broke; collapsing it into `ok` with a blank payload would invent a
 * brain that does not exist.
 */
export type BrainRead =
  | {
      status: 'ok'
      active: BrandMemoryPayload
      version: number
      provenance: Provenance
      /**
       * Raw per-field provenance, carried so a write path can merge onto it
       * rather than re-deriving it. `undefined` for every brain saved before
       * `field_meta` existed.
       */
      meta: BrandFieldMetaMap | undefined
      /**
       * The stored onboarding picks, carried so `saveBrandMemory` can hand them
       * back to the next version rather than dropping them.
       *
       * `BrandMemoryPayloadSchema` has no `intake` key, so anything left on
       * `active` would be stripped on the next save and the regime would be lost
       * to the first hand-edit. It is destructured OUT of `active` for the same
       * reason `field_meta` is: `active` is what the editor renders and what the
       * model contract validates, and neither has any business seeing this.
       *
       * `undefined` for every brain written before this existed, and for any
       * workspace whose regime was only ever assumed.
       */
      intake: BrandIntake | undefined
    }
  | { status: 'no-workspace' }
  | { status: 'no-brain' }
  | { status: 'unreadable' }

/**
 * Memoised per request: the topbar ring and the /brain page both need the active
 * brain, and they render in the same pass. Without this they issue the same query
 * twice and — worse — could disagree if a write landed between them.
 */
export const readBrain = cache(async (): Promise<BrainRead> => {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return { status: 'no-workspace' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('brand_memory')
      .select('version, status, source, payload')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      console.error('[brain] active read failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    if (!data) return { status: 'no-brain' }

    const row = data as { version?: unknown; payload?: unknown }
    const stored = StoredBrandMemorySchema.safeParse(row.payload)
    if (!stored.success) return { status: 'unreadable' }

    const { field_meta: meta, intake, ...active } = stored.data

    return {
      status: 'ok',
      active,
      version: typeof row.version === 'number' ? row.version : 0,
      provenance: provenanceOf(meta),
      meta,
      intake,
    }
  } catch (error) {
    console.error('[brain] active read threw', error instanceof Error ? error.message : 'unknown')
    return { status: 'unreadable' }
  }
})
