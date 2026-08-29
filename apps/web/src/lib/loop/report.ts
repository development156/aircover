import 'server-only'

import type { Channel } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import type { LoopCycleView } from './read'

/**
 * THE CMO REPORT'S DATA — every figure from a real query, or absent.
 *
 * ── ABSENT, NOT ZERO, AND NOT A DASH ─────────────────────────────────────────
 * Each block below returns null when it has nothing. A zero would be a
 * measurement of nothing, which is a claim; a dash is a zero wearing a costume.
 * A null lets the page say what it does not know, which is the only true thing
 * available.
 *
 * ── THE BEST POST IS A ROW, NOT A JUDGEMENT ──────────────────────────────────
 * "Your best post" means the one with the highest measured value of a named
 * metric over a named window, and the report says exactly that rather than the
 * word "best" on its own. A ranking of one post is not a ranking, so both the
 * top and the bottom are withheld unless at least two posts were measured —
 * otherwise the same post is simultaneously the best and the worst, which is
 * technically true and useless.
 */

export interface RankedPost {
  postId: string
  title: string
  channel: Channel
  metric: string
  value: number
}

export interface ReportData {
  cycle: LoopCycleView
  /** Null when fewer than two posts were measured in the window. */
  ranking: { top: RankedPost; bottom: RankedPost; postsMeasured: number } | null
  /** Learnings this cycle proposed, and what became of each. */
  learnings: ReadonlyArray<{ summary: string; status: string; appliedVersion: number | null }>
  /** What the cycle put in the Planner. */
  plan: ReadonlyArray<{
    title: string
    channels: readonly string[]
    slot: string | null
    outcome: string
  }>
  creditsSpent: number
  budgetCredits: number | null
}

/** The two posts at the ends of the window, or null when there is no ranking to make. */
export async function readRanking(
  workspaceId: string,
  fromIso: string,
  toIso: string,
  metric = 'impressions',
): Promise<ReportData['ranking']> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('post_metric_snapshots')
    .select('post_id, channel, value')
    .eq('workspace_id', workspaceId)
    .eq('metric', metric)
    .gte('measured_on', fromIso)
    .lte('measured_on', toIso)
  if (!data || data.length === 0) return null

  // One value per post: the highest reading it reached. A post measured on four
  // days is one post, and summing its dailies would rank a post that was
  // measured more often above one that performed better.
  const best = new Map<string, { channel: Channel; value: number }>()
  for (const row of data) {
    const id = row.post_id as string
    const value = Number(row.value)
    const found = best.get(id)
    if (!found || value > found.value) best.set(id, { channel: row.channel as Channel, value })
  }
  if (best.size < 2) return null

  const { data: posts } = await supabase
    .from('posts')
    .select('id, title')
    .eq('workspace_id', workspaceId)
    .in('id', [...best.keys()])
  const titles = new Map(
    (posts ?? []).map((p) => [p.id as string, (p.title as string) ?? 'Untitled']),
  )

  const ranked = [...best.entries()]
    .map(([postId, v]) => ({
      postId,
      title: titles.get(postId) ?? 'Untitled',
      channel: v.channel,
      metric,
      value: v.value,
    }))
    .sort((a, b) => b.value - a.value)

  const top = ranked[0]
  const bottom = ranked[ranked.length - 1]
  if (!top || !bottom) return null
  return { top, bottom, postsMeasured: ranked.length }
}

/** What this cycle proposed, and what the person did about it. */
export async function readCycleLearnings(
  workspaceId: string,
  cycleId: string,
): Promise<ReportData['learnings']> {
  const supabase = createServerSupabase()
  // ── THE CYCLE IS FILTERED IN THE DATABASE, NOT AFTER THE LIMIT ─────────────
  // This read used to take the 20 most recent insight events and THEN keep the
  // ones belonging to this cycle. A workspace with twenty newer events than its
  // last cycle's — which is a workspace that has been running a while, not an
  // unusual one — got an empty learnings block on a report whose cycle really
  // did propose something. The page would then say Sahoda noticed nothing,
  // which is a claim about their week that no query established.
  //
  // `loop_cycle_id` lives inside the `diff` JSONB, so the filter is `->>` on
  // the key. The limit stays as a bound on a read that is otherwise unbounded,
  // but it now bounds the rows that MATCH rather than the rows searched.
  const { data } = await supabase
    .from('memory_events')
    .select('diff, status, applied_memory_version')
    .eq('workspace_id', workspaceId)
    .eq('source', 'insight')
    .eq('diff->>loop_cycle_id', cycleId)
    .order('created_at', { ascending: false })
    .limit(20)
  return (data ?? []).map((row) => {
    const diff = (row.diff ?? {}) as Record<string, unknown>
    return {
      summary: typeof diff.summary === 'string' ? diff.summary : 'Sahoda noticed something.',
      status: row.status as string,
      appliedVersion: (row.applied_memory_version as number | null) ?? null,
    }
  })
}
