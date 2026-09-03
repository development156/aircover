import 'server-only'

import type { Channel } from '@sahoda/shared'

import type { Publication, Snapshot, WeekChanges, WeekReport } from '@/lib/analytics/week-report'
import { VERDICT_WINDOW_DAYS, weekReports } from '@/lib/analytics/week-report'
import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * THE FOUR READS BEHIND THE WEEKLY REPORT.
 *
 * ── WHY THIS IS A SEPARATE MODULE FROM THE ARITHMETIC ────────────────────────
 * `week-report.ts` decides what may be CLAIMED and holds no I/O, so its every
 * refusal is testable without a database. This file only fetches, and it holds
 * no judgement at all: nothing here decides whether a figure may be shown.
 *
 * ── NEVER REJECTS ────────────────────────────────────────────────────────────
 * The same rule `page-data.ts` and `series.ts` follow. A hiccup in one read must
 * cost the section it feeds, not the page — so a failure returns
 * `{ kind: 'unreadable' }` and the screen says it could not look, which is a
 * different sentence from finding nothing.
 */

/** How much history the stack shows. Two years of weeks is already a long scroll. */
export const HISTORY_DAYS = 730

/** Most rows one read will take. Past it a total is a subtotal — see `series.ts`. */
export const ROW_CAP = 5000

export type WeeklyRead =
  /** A read went out and did not come back. Different claim, different sentence. */
  | { kind: 'unreadable' }
  /** No workspace, so there is nothing these weeks could belong to. */
  | { kind: 'no-workspace' }
  /** Nothing has published, ever. The teaching empty state's case. */
  | { kind: 'nothing-published' }
  | { kind: 'ready'; weeks: WeekReport[] }

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString()
}

/**
 * Every week that published something, newest first.
 *
 * The snapshot window is deliberately WIDER than the publication window: the
 * verdict for the oldest week shown looks back `VERDICT_WINDOW_DAYS` from that
 * week, and a reading outside the window would make the oldest week's verdict
 * quietly weaker than the same week's verdict was when it was new.
 */
export async function readWeeklyReport(now: Date = new Date()): Promise<WeeklyRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { kind: 'no-workspace' }
    if (workspace.status !== 'ok') return { kind: 'unreadable' }
    const workspaceId = workspace.workspace.id

    const supabase = createServerSupabase()
    const since = isoDaysAgo(now, HISTORY_DAYS)

    const { data: logs, error: logsError } = await supabase
      .from('post_publish_logs')
      .select('post_id, channel, published_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'succeeded')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(ROW_CAP)

    if (logsError || !logs) return { kind: 'unreadable' }
    if (logs.length === 0) return { kind: 'nothing-published' }

    const postIds = [...new Set(logs.map((row) => String(row.post_id)))]

    const [titles, snapshots, changes] = await Promise.all([
      readTitles(supabase, workspaceId, postIds),
      readSnapshots(supabase, workspaceId, now),
      readChanges(supabase, workspaceId),
    ])

    if (snapshots === 'unreadable') return { kind: 'unreadable' }

    const publications: Publication[] = []
    for (const row of logs) {
      const postId = typeof row.post_id === 'string' ? row.post_id : null
      const channel = typeof row.channel === 'string' ? (row.channel as Channel) : null
      const publishedAt = typeof row.published_at === 'string' ? row.published_at : null
      // A row missing any of the three is dropped rather than defaulted. A
      // publication with an invented date lands in the wrong week and takes its
      // numbers with it.
      if (postId === null || channel === null || publishedAt === null) continue
      publications.push({
        postId,
        channel,
        publishedAt,
        title: titles.get(postId) ?? 'Untitled post',
      })
    }

    if (publications.length === 0) return { kind: 'nothing-published' }

    return {
      kind: 'ready',
      weeks: weekReports({ publications, snapshots, changes, metric: 'reach' }),
    }
  } catch {
    return { kind: 'unreadable' }
  }
}

async function readTitles(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  postIds: readonly string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  if (postIds.length === 0) return titles
  const { data } = await supabase
    .from('posts')
    .select('id, title, body')
    .eq('workspace_id', workspaceId)
    .in('id', postIds)

  for (const row of data ?? []) {
    const id = typeof row.id === 'string' ? row.id : null
    if (id === null) continue
    // Same fallback ladder `page-data.ts` uses, so one post is never called two
    // different things on two screens.
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    const body = typeof row.body === 'string' ? row.body.trim() : ''
    if (title) titles.set(id, title)
    else if (body) titles.set(id, body.length > 60 ? `${body.slice(0, 60)}…` : body)
  }
  return titles
}

async function readSnapshots(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  now: Date,
): Promise<Snapshot[] | 'unreadable'> {
  const { data, error } = await supabase
    .from('post_metric_snapshots')
    .select('post_id, channel, metric, value, measured_on')
    .eq('workspace_id', workspaceId)
    .gte('measured_on', isoDaysAgo(now, HISTORY_DAYS + VERDICT_WINDOW_DAYS).slice(0, 10))
    .limit(ROW_CAP)

  // A refused read is reported as refused, never as an empty history. Every
  // figure downstream refuses politely on an empty history — "we have not
  // measured enough of your posts yet" — and that sentence is a claim about the
  // customer's account. Saying it because a query failed would be a false one.
  if (error || !data) return 'unreadable'
  // At the cap the population is truncated, and a truncated population makes
  // every total a subtotal. Refused rather than drawn.
  if (data.length >= ROW_CAP) return 'unreadable'

  const out: Snapshot[] = []
  for (const row of data) {
    const value =
      typeof row.value === 'number'
        ? row.value
        : typeof row.value === 'string'
          ? Number(row.value)
          : Number.NaN
    const measuredOn = typeof row.measured_on === 'string' ? row.measured_on.slice(0, 10) : null
    // `bigint` arrives as a string over the wire. A row we cannot read is
    // dropped, never counted as zero — a zero here is a measurement of nothing.
    if (!Number.isFinite(value) || measuredOn === null) continue
    if (typeof row.post_id !== 'string' || typeof row.channel !== 'string') continue
    if (typeof row.metric !== 'string') continue
    out.push({
      postId: row.post_id,
      channel: row.channel as Channel,
      metric: row.metric,
      value,
      measuredOn,
    })
  }
  return out
}

/**
 * What the Loop did, week by week.
 *
 * A brief counts as something that HAPPENED only once it carries a `post_id` —
 * that is the column that says the plan became a real post. A brief the Loop
 * proposed and never wrote is not a change it made, and listing it under "what I
 * changed" would be the product taking credit for an intention.
 */
async function readChanges(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
): Promise<WeekChanges[]> {
  const { data: cycles, error } = await supabase
    .from('loop_cycles')
    .select('id, iso_year, iso_week, reflect_reason')
    .eq('workspace_id', workspaceId)
    .order('started_at', { ascending: false })
    .limit(200)

  if (error || !cycles || cycles.length === 0) return []

  const { data: briefs } = await supabase
    .from('loop_briefs')
    .select('cycle_id, title, rationale, post_id')
    .eq('workspace_id', workspaceId)
    .in(
      'cycle_id',
      cycles.map((cycle) => cycle.id),
    )

  const byCycle = new Map<string, Array<{ what: string; why: string | null }>>()
  for (const brief of briefs ?? []) {
    if (typeof brief.cycle_id !== 'string' || typeof brief.post_id !== 'string') continue
    const list = byCycle.get(brief.cycle_id) ?? []
    list.push({
      what: typeof brief.title === 'string' ? brief.title : 'Untitled post',
      why: typeof brief.rationale === 'string' && brief.rationale.trim() ? brief.rationale : null,
    })
    byCycle.set(brief.cycle_id, list)
  }

  const out: WeekChanges[] = []
  for (const cycle of cycles) {
    if (typeof cycle.id !== 'string') continue
    if (typeof cycle.iso_year !== 'number' || typeof cycle.iso_week !== 'number') continue
    out.push({
      isoYear: cycle.iso_year,
      isoWeek: cycle.iso_week,
      did: byCycle.get(cycle.id) ?? [],
      nothingReason: typeof cycle.reflect_reason === 'string' ? cycle.reflect_reason : null,
    })
  }
  return out
}
