import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Post counts by status, channel and origin, for Home's greeting sentence.
 *
 * Capped, and OLDEST-first truncation applies here too: the order is
 * `updated_at DESC`, so past the cap these become "counts of the most recently
 * touched N posts" while still LOOKING like counts of everything. `capped` and
 * `coveredFrom` exist so the UI can say which, rather than let a partial count
 * read as a total. See `spend.ts` for the full reasoning.
 *
 * Only draft / approved / published / failed (and `idea`, written by apps/jobs)
 * ever occur — `review`, `scheduled`, `publishing` and `expired` are in the enum
 * but no code path writes them, so counts for those are structurally zero.
 */

export const COUNTS_LIMIT = 300

export interface PostCounts {
  status: 'ok' | 'empty' | 'unreadable'
  /** Keyed by post status. Absent keys are genuinely zero. */
  byStatus: Record<string, number>
  byChannel: { channel: string; count: number }[]
  byOrigin: { manual: number; plan_week: number }
  total: number
  capped: boolean
  coveredFrom: string | null
}

const EMPTY: PostCounts = {
  status: 'empty',
  byStatus: {},
  byChannel: [],
  byOrigin: { manual: 0, plan_week: 0 },
  total: 0,
  capped: false,
  coveredFrom: null,
}

interface PostRow {
  status: unknown
  origin: unknown
  channels: unknown
  updated_at: unknown
}

export async function readPostCounts(): Promise<PostCounts> {
  try {
    const workspace = await getActiveWorkspace()
    if (workspace === null) return EMPTY

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('status, origin, channels, updated_at')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })
      .limit(COUNTS_LIMIT)

    if (error || !data) {
      if (error) console.error('[home] post counts failed', error.code, error.message)
      return { ...EMPTY, status: 'unreadable' }
    }

    const rows = data as PostRow[]
    if (rows.length === 0) return EMPTY

    const byStatus: Record<string, number> = {}
    const perChannel = new Map<string, number>()
    const byOrigin = { manual: 0, plan_week: 0 }
    let total = 0
    let oldest: string | null = null

    for (const row of rows) {
      // A row whose status is not a string cannot be counted under a sane key;
      // dropping it is better than a `[object Object]` bucket on the dashboard.
      if (typeof row.status !== 'string') continue
      total += 1
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1

      if (row.origin === 'plan_week') byOrigin.plan_week += 1
      else byOrigin.manual += 1

      if (Array.isArray(row.channels)) {
        // De-duped per post: `channels` is a bare text[] with no unique
        // constraint, so a repeated value is storable and would inflate the
        // count of a channel the post targets only once.
        for (const channel of new Set(row.channels)) {
          if (typeof channel !== 'string') continue
          perChannel.set(channel, (perChannel.get(channel) ?? 0) + 1)
        }
      }

      if (typeof row.updated_at === 'string') {
        const key = row.updated_at.slice(0, 10)
        if (oldest === null || key < oldest) oldest = key
      }
    }

    if (total === 0) return EMPTY

    const capped = rows.length >= COUNTS_LIMIT

    return {
      status: 'ok',
      byStatus,
      byChannel: [...perChannel.entries()]
        .map(([channel, count]) => ({ channel, count }))
        .sort((a, b) => b.count - a.count),
      byOrigin,
      total,
      capped,
      coveredFrom: capped ? oldest : null,
    }
  } catch (error) {
    console.error('[home] post counts threw', error instanceof Error ? error.message : '?')
    return { ...EMPTY, status: 'unreadable' }
  }
}
