import 'server-only'

import { cache } from 'react'
import { BrandMemoryPayloadSchema, type BrandMemoryPayload } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

import { provenanceOf, type BrainVersion, type Provenance } from './provenance'

/**
 * Brand Brain reads. `brand_memory` carries a member-SELECT policy only (writes go
 * through `public.resolve_brand_memory`), and that policy filters on
 * `workspace_id` alone — superseded versions are readable, which is what makes
 * per-field provenance recoverable from history at all.
 *
 * Every read is filtered to the ACTIVE workspace. As in the wallet reads, this is
 * a CORRECTNESS filter and not an authorization check: the member policy admits
 * every workspace the user belongs to, so without it a second membership would
 * fold two brands' version histories into one diff.
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
       * False when a historical version could not be parsed. Provenance is then
       * served EMPTY (every field reads as a guess) rather than computed from a
       * hole: a missing version silently re-attributes its edits to whichever
       * version came next, which would manufacture confirmations nobody made.
       */
      historyComplete: boolean
    }
  | { status: 'no-workspace' }
  | { status: 'no-brain' }
  | { status: 'unreadable' }

interface RawRow {
  version?: unknown
  status?: unknown
  source?: unknown
  payload?: unknown
}

function toVersion(row: RawRow): BrainVersion | null {
  const { version, source } = row
  if (typeof version !== 'number') return null
  if (source !== 'resolved' && source !== 'manual' && source !== 'system') return null
  const payload = BrandMemoryPayloadSchema.safeParse(row.payload)
  if (!payload.success) return null
  return { version, source, payload: payload.data }
}

/**
 * Memoised per request: the topbar ring and the /brain page both need the full
 * version history, and they render in the same pass. Without this they issue the
 * same query twice and — worse — could disagree if a write landed between them.
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
      .order('version', { ascending: true })

    if (error) {
      console.error('[brain] version read failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    const rows = (data ?? []) as RawRow[]
    if (rows.length === 0) return { status: 'no-brain' }

    const activeRow = rows.find((row) => row.status === 'active')
    // Rows exist but none is active. The one-active-per-workspace index makes
    // this impossible by construction, so it is a fault, not a first run —
    // "reload" is the honest remedy, and offering onboarding here would invite
    // the user to overwrite a brain that is still there.
    if (!activeRow) {
      console.error('[brain] no active version among', rows.length, 'rows')
      return { status: 'unreadable' }
    }

    const active = BrandMemoryPayloadSchema.safeParse(activeRow.payload)
    if (!active.success) return { status: 'unreadable' }
    const version = typeof activeRow.version === 'number' ? activeRow.version : 0

    const versions = rows.flatMap((row) => {
      const parsed = toVersion(row)
      return parsed ? [parsed] : []
    })
    const historyComplete = versions.length === rows.length

    return {
      status: 'ok',
      active: active.data,
      version,
      provenance: historyComplete ? provenanceOf(versions) : new Map(),
      historyComplete,
    }
  } catch (error) {
    console.error('[brain] version read threw', error instanceof Error ? error.message : 'unknown')
    return { status: 'unreadable' }
  }
})
