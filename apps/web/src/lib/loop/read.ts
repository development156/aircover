import 'server-only'

import {
  DEFAULT_AUTONOMY_LEVEL,
  DEFAULT_WEEKLY_BUDGET_CREDITS,
  toChannelSet,
  type AutonomyLevel,
  type Channel,
  type ChannelSet,
} from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * EVERYTHING THE LOOP SCREEN READS — through the RLS-scoped client, always.
 *
 * The orchestrator writes over an owner connection because the cycle tables are
 * read-only to members. Reading is the other way round: a page renders what the
 * signed-in person is allowed to see, so it goes through the client that carries
 * their token and lets the database decide. A page that read over the owner
 * connection would render one customer's week to another the first time a
 * workspace id was threaded wrong.
 */

export interface LoopSnapshot {
  paused: boolean
  weeklyBudgetCredits: number
  /** Only the levels a person actually chose. A missing channel is not L1 — it is unset. */
  dial: Map<Channel, AutonomyLevel>
  connected: ChannelSet
  cycle: LoopCycleView | null
  briefs: readonly LoopBriefView[]
  learnings: readonly PendingLearning[]
}

export interface LoopCycleView {
  id: string
  isoYear: number
  isoWeek: number
  status: string
  estimatedCredits: number | null
  approvedCredits: number | null
  costApprovedAt: string | null
  spentCredits: number
  budgetCredits: number | null
  reflectSkippedNoHistory: boolean
  failureReason: string | null
  startedAt: string
  reportedAt: string | null
}

export interface LoopBriefView {
  id: string
  priority: number
  title: string
  body: string
  channels: ChannelSet
  suggestedSlot: string | null
  rationale: string | null
  estimatedCredits: number
  included: boolean
  postId: string | null
  stageOutcome: string
}

export interface PendingLearning {
  id: string
  summary: string
  /** Every figure the screen may print about this claim, and nothing else. */
  evidence: { sampleSize: number; windowDays: number; metric: string; postCount: number } | null
  createdAt: string
}

/** The default a workspace that has never opened this screen is running at. */
export const UNSET_SNAPSHOT: Omit<LoopSnapshot, 'dial' | 'connected'> = {
  paused: false,
  weeklyBudgetCredits: DEFAULT_WEEKLY_BUDGET_CREDITS,
  cycle: null,
  briefs: [],
  learnings: [],
}

export async function readLoopSnapshot(workspaceId: string): Promise<LoopSnapshot> {
  const supabase = createServerSupabase()

  const [settingsRes, dialRes, connRes, cycleRes, learnRes] = await Promise.all([
    supabase
      .from('loop_settings')
      .select('paused, weekly_budget_credits')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase.from('loop_channel_autonomy').select('channel, level').eq('workspace_id', workspaceId),
    supabase
      .from('connections')
      .select('platform')
      .eq('workspace_id', workspaceId)
      .eq('status', 'connected'),
    supabase
      .from('loop_cycles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('memory_events')
      .select('id, diff, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .eq('source', 'insight')
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const dial = new Map<Channel, AutonomyLevel>()
  for (const row of dialRes.data ?? []) {
    dial.set(row.channel as Channel, row.level as AutonomyLevel)
  }

  const connected = toChannelSet(
    (connRes.data ?? [])
      .map((r) => r.platform as Channel)
      .filter((p): p is Channel => ['x', 'gbp', 'linkedin', 'instagram'].includes(p)),
  )

  const raw = cycleRes.data as Record<string, unknown> | null
  const cycle: LoopCycleView | null = raw
    ? {
        id: raw.id as string,
        isoYear: raw.iso_year as number,
        isoWeek: raw.iso_week as number,
        status: raw.status as string,
        estimatedCredits: (raw.estimated_credits as number | null) ?? null,
        approvedCredits: (raw.approved_credits as number | null) ?? null,
        costApprovedAt: (raw.cost_approved_at as string | null) ?? null,
        spentCredits: (raw.spent_credits as number) ?? 0,
        budgetCredits: (raw.budget_credits as number | null) ?? null,
        reflectSkippedNoHistory: Boolean(raw.reflect_skipped_no_history),
        failureReason: (raw.failure_reason as string | null) ?? null,
        startedAt: raw.started_at as string,
        reportedAt: (raw.reported_at as string | null) ?? null,
      }
    : null

  let briefs: LoopBriefView[] = []
  if (cycle) {
    const { data } = await supabase
      .from('loop_briefs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('cycle_id', cycle.id)
      .order('priority')
    briefs = (data ?? []).map((row) => ({
      id: row.id as string,
      priority: row.priority as number,
      title: row.title as string,
      body: row.body as string,
      channels: toChannelSet((row.channels as Channel[]) ?? []),
      suggestedSlot: (row.suggested_slot as string | null) ?? null,
      rationale: (row.rationale as string | null) ?? null,
      estimatedCredits: row.estimated_credits as number,
      included: Boolean(row.included),
      postId: (row.post_id as string | null) ?? null,
      stageOutcome: row.stage_outcome as string,
    }))
  }

  return {
    paused: Boolean(settingsRes.data?.paused),
    weeklyBudgetCredits:
      (settingsRes.data?.weekly_budget_credits as number | undefined) ??
      DEFAULT_WEEKLY_BUDGET_CREDITS,
    dial,
    connected,
    cycle,
    briefs,
    learnings: (learnRes.data ?? []).map(toPendingLearning),
  }
}

/**
 * A learning, reduced to what a screen may print.
 *
 * `evidence` is null when the stored diff has none — and a learning with no
 * evidence is rendered WITHOUT the figures rather than with zeroes. A zero
 * sample size on screen reads as a real measurement of nothing, which is a
 * different and false claim from "this proposal did not record its working".
 */
function toPendingLearning(row: Record<string, unknown>): PendingLearning {
  const diff = (row.diff ?? {}) as Record<string, unknown>
  const ev = diff.evidence as Record<string, unknown> | undefined
  const postIds = Array.isArray(ev?.post_ids) ? (ev.post_ids as unknown[]) : null
  return {
    id: row.id as string,
    summary: typeof diff.summary === 'string' ? diff.summary : 'Sahoda noticed something.',
    evidence:
      ev && typeof ev.sample_size === 'number' && typeof ev.window_days === 'number'
        ? {
            sampleSize: ev.sample_size,
            windowDays: ev.window_days,
            metric: typeof ev.metric === 'string' ? ev.metric : 'reach',
            postCount: postIds?.length ?? 0,
          }
        : null,
    createdAt: row.created_at as string,
  }
}

/** The level in force for a channel, and whether a person actually chose it. */
export function levelFor(
  dial: Map<Channel, AutonomyLevel>,
  channel: Channel,
): { level: AutonomyLevel; chosen: boolean } {
  const stored = dial.get(channel)
  return stored === undefined
    ? { level: DEFAULT_AUTONOMY_LEVEL, chosen: false }
    : { level: stored, chosen: true }
}
