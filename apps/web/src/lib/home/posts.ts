import 'server-only'

import { ChannelSchema, toChannelSet, type Channel } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

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
  /**
   * Keyed by the value the row actually carries. Absent keys are genuinely zero.
   *
   * Not a fixed shape, for the same reason `byStatus` above is not: this column
   * has already learned a third value in production without this file hearing
   * about it ('playbook', 2026-08-22) and a fourth ('radar') landed the same
   * day. A closed shape means the next one is counted as something it is not.
   */
  byOrigin: Record<string, number>
  total: number
  capped: boolean
  coveredFrom: string | null
}

const EMPTY: PostCounts = {
  status: 'empty',
  byStatus: {},
  byChannel: [],
  byOrigin: {},
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
    // An UNREADABLE workspace read is not an empty workspace. It used to arrive
    // here as `null` and render as "nothing yet", which is a claim about the
    // account drawn from a question that never got an answer.
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return { ...EMPTY, status: 'unreadable' }
    if (workspace.status === 'none') return EMPTY

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('status, origin, channels, updated_at')
      .eq('workspace_id', workspace.workspace.id)
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
    const byOrigin: Record<string, number> = {}
    let total = 0
    let oldest: string | null = null

    for (const row of rows) {
      // A row whose status is not a string cannot be counted under a sane key;
      // dropping it is better than a `[object Object]` bucket on the dashboard.
      if (typeof row.status !== 'string') continue
      total += 1
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1

      // Keyed by what the row says, never by an else.
      //
      // The branch this replaces asserted that anything which is not
      // 'plan_week' was written BY HAND — and 'manual' is the value the product
      // uses to mean exactly that. Production widened this column to admit
      // 'playbook' and now 'radar', so every machine-written draft of both kinds
      // was being counted as a person's work on the home screen, silently and
      // with no way to notice.
      //
      // A non-string origin is dropped rather than given an `[object Object]`
      // bucket — the same call the status guard six lines above makes.
      if (typeof row.origin === 'string') {
        byOrigin[row.origin] = (byOrigin[row.origin] ?? 0) + 1
      }

      if (Array.isArray(row.channels)) {
        // This is the ONE posts read that does not go through `PostSchema` — it
        // selects four columns for a counting query, so there is no row to parse.
        // It therefore has to reach the row boundary itself rather than keep a
        // private copy of it: `channels` is a bare text[] with no unique
        // constraint, and a repeated value would inflate the count of a channel
        // the post targets once.
        //
        // Narrowed per element, not per row: one unrecognised value must not
        // discard a post's other channels, which is what parsing the whole array
        // at once would do. A value outside `ChannelSchema` is dropped — it is not
        // a channel this product has a name, a chip or a constraint for, and every
        // other surface already refuses to render it.
        const known: Channel[] = []
        for (const channel of row.channels) {
          const parsed = ChannelSchema.safeParse(channel)
          if (parsed.success) known.push(parsed.data)
        }
        for (const channel of toChannelSet(known)) {
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
