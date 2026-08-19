import 'server-only'

import { cache } from 'react'
import {
  StoredBrandMemorySchema,
  type BrandFieldMetaMap,
  type BrandIntake,
  type BrandMemoryPayload,
} from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

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
  const read = await activeWorkspaceRead()
  return read.status === 'ok' ? read.workspace.id : null
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
      /**
       * `brand_memory.source` — `resolved`, `manual` or `system`, validated by
       * the RPC against exactly those three.
       *
       * The SELECT below has always fetched this column and the read has always
       * dropped it. It is the only stored fact about how a version came to
       * exist, and it carries the one distinction a Brand Brain screen must
       * never blur: `system` means a model fallback saved an EXAMPLE brain, not
       * a reading of this customer's business. `saveBrandMemory` states that
       * contract; nothing rendered it until the resolution console.
       *
       * `null` for a row whose value is absent or outside the three — see
       * `brainOrigin`, which reports that as "not recorded" rather than
       * guessing the common case.
       */
      source: string | null
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
    // `no-workspace` and `unreadable` are two of this union's four answers, and
    // the read below used to collapse them: an unreadable workspace read reached
    // here as `null` and the topbar ring reported "No brain yet" — a claim about
    // the account, from a question that never got an answer.
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return { status: 'unreadable' }
    if (workspace.status === 'none') return { status: 'no-workspace' }
    const workspaceId = workspace.workspace.id

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

    const row = data as { version?: unknown; payload?: unknown; source?: unknown }
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
      source: typeof row.source === 'string' ? row.source : null,
    }
  } catch (error) {
    console.error('[brain] active read threw', error instanceof Error ? error.message : 'unknown')
    return { status: 'unreadable' }
  }
})
