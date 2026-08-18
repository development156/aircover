import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * What actually went out, workspace-wide, for Home.
 *
 * `post_publish_logs` is member-readable and service-role-insert: apps/web reads
 * it and never writes it. Expect this to be EMPTY for most workspaces — only
 * apps/jobs writes logs, so a workspace that has never had a real publish run
 * genuinely has none. That is the normal state, not a degraded one, and Home is
 * designed around it rather than treating it as a failure.
 *
 * `empty` and `unreadable` are kept apart deliberately. "Nothing has published"
 * and "we could not read your publish history" are different claims, and only
 * one of them can be true at a time.
 *
 * Capped OLDEST-first like every other Home read — see `spend.ts` for why the
 * direction of truncation is the dangerous part.
 */

export const PUBLISH_LIMIT = 200

export interface PublishSummary {
  status: 'ok' | 'empty' | 'unreadable'
  attempts: number
  succeeded: number
  failed: number
  /** SUCCEEDED live publishes. A failed live attempt published nothing. */
  live: number
  /** SUCCEEDED fixture runs — simulated, never real. */
  fixture: number
  capped: boolean
  coveredFrom: string | null
}

const EMPTY: PublishSummary = {
  status: 'empty',
  attempts: 0,
  succeeded: 0,
  failed: 0,
  live: 0,
  fixture: 0,
  capped: false,
  coveredFrom: null,
}

interface LogRow {
  status: unknown
  mode: unknown
  created_at: unknown
}

export async function readPublishSummary(now: Date = new Date()): Promise<PublishSummary> {
  void now
  try {
    // An UNREADABLE workspace read is not an empty workspace. It used to arrive
    // here as `null` and render as "nothing yet", which is a claim about the
    // account drawn from a question that never got an answer.
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return { ...EMPTY, status: 'unreadable' }
    if (workspace.status === 'none') return EMPTY

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_publish_logs')
      .select('status, mode, created_at')
      .eq('workspace_id', workspace.workspace.id)
      .order('created_at', { ascending: false })
      .limit(PUBLISH_LIMIT)

    if (error || !data) {
      if (error) console.error('[home] publish summary failed', error.code, error.message)
      return { ...EMPTY, status: 'unreadable' }
    }

    const rows = data as LogRow[]
    if (rows.length === 0) return EMPTY

    let succeeded = 0
    let failed = 0
    let live = 0
    let fixture = 0
    let oldest: string | null = null

    for (const row of rows) {
      const ok = row.status === 'succeeded'
      if (ok) succeeded += 1
      else if (row.status === 'failed') failed += 1

      // Modes count only on success: a failed live attempt is not a publish, and
      // counting it would overstate what actually reached a channel.
      if (ok && row.mode === 'live') live += 1
      if (ok && row.mode === 'fixture') fixture += 1

      if (typeof row.created_at === 'string') {
        const key = row.created_at.slice(0, 10)
        if (oldest === null || key < oldest) oldest = key
      }
    }

    const capped = rows.length >= PUBLISH_LIMIT

    return {
      status: 'ok',
      attempts: rows.length,
      succeeded,
      failed,
      live,
      fixture,
      capped,
      coveredFrom: capped ? oldest : null,
    }
  } catch (error) {
    console.error('[home] publish summary threw', error instanceof Error ? error.message : '?')
    return { ...EMPTY, status: 'unreadable' }
  }
}
