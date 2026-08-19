import 'server-only'

import type { Channel } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * Saved starting points, for the workspace that is open.
 *
 * ── NO ROW SCHEMA IN @sahoda/shared, AND THAT IS DELIBERATE ─────────────────
 * The standing checklist asks for a zod row schema per table. That package is a
 * frozen contract, so this parses at the render edge instead — the same pattern
 * `variant-version.ts` and `variant-format.ts` already use for the two columns
 * the frozen post schema strips.
 *
 * ── THE THREE ANSWERS, KEPT APART ───────────────────────────────────────────
 * An empty list and a failed read are different sentences, and a count is a claim
 * about the customer's library that only one of them earns. `unreadable` never
 * renders as "you have none" and never renders as a zero: this repo has spent
 * whole runs removing that collapse from every other read, and a new read does
 * not get to reintroduce it.
 */

export interface TemplateRow {
  id: string
  name: string
  /** Null means it suits any channel — a real answer, not a missing one. */
  channel: Channel | null
  body: string
}

export type TemplatesRead =
  { status: 'ok'; templates: TemplateRow[] } | { status: 'no-workspace' } | { status: 'unreadable' }

/** Enough for a picker; a library past this is a screen, not a card. */
export const TEMPLATE_LIMIT = 50

function rowOf(raw: unknown): TemplateRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null
  if (typeof row.body !== 'string') return null
  const channel = typeof row.channel === 'string' ? (row.channel as Channel) : null
  return { id: row.id, name: row.name, channel, body: row.body }
}

export async function readTemplates(): Promise<TemplatesRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { status: 'no-workspace' }
    if (workspace.status !== 'ok') return { status: 'unreadable' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('templates')
      .select('id, name, channel, body')
      .eq('workspace_id', workspace.workspace.id)
      .order('updated_at', { ascending: false })
      .limit(TEMPLATE_LIMIT)

    if (error || !data) return { status: 'unreadable' }
    // Per row, so one malformed row cannot take down the list.
    return { status: 'ok', templates: data.flatMap((r) => rowOf(r) ?? []) }
  } catch {
    return { status: 'unreadable' }
  }
}
