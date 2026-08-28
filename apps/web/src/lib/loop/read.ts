import 'server-only'

import {
  DEFAULT_AUTONOMY_LEVEL,
  DEFAULT_WEEKLY_BUDGET_CREDITS,
  toChannelSet,
  type AutonomyLevel,
  type Channel,
  type ChannelSet,
} from '@sahoda/shared'

import { countConfirmedFields } from '@/lib/brand/confirmed-count'
import { RING_DENOMINATOR } from '@/lib/brand/fields'
import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * The `connections.status` values that mean Sahoda can publish, and the ones
 * that mean it once could.
 *
 * These are spelled out against the CHECK the migration declares —
 * ('active','expired','revoked','error') — because a filter naming a value the
 * column cannot hold returns an empty set, and an empty set is exactly what a
 * workspace with no channels returns. Three sites in this repo filtered on
 * `status = 'connected'`, which is not one of the four; measured against
 * production on 2026-08-22 the table held 4 'expired' and 2 'active' rows and
 * not one 'connected'. `lib/repo/check-constraints.test.ts` now adjudicates
 * every such comparison in the repo against the schema.
 */
const LIVE_STATUS = ['active'] as const
const LAPSED_STATUS = ['expired', 'revoked', 'error'] as const
/** The channels the Loop can plan for. Others may be connected and are not planned. */
const PLANNABLE: readonly string[] = ['x', 'gbp', 'linkedin', 'instagram']

/**
 * EVERYTHING THE LOOP SCREEN READS — through the RLS-scoped client, always.
 *
 * The orchestrator writes over an owner connection because the cycle tables are
 * read-only to members. Reading is the other way round: a page renders what the
 * signed-in person is allowed to see, so it goes through the client that carries
 * their token and lets the database decide. A page that read over the owner
 * connection would render one customer's week to another the first time a
 * workspace id was threaded wrong.
 *
 * ── ONE NULL, TWO MEANINGS — WHAT `readLoop` EXISTS TO STOP ──────────────────
 * `readLoopSnapshot` reads six tables and used to discard every error: `data ??
 * []`, `data?.paused`, `cycleRes.data as … | null`. An empty answer therefore
 * meant "nothing here" and "the query failed" at once, and /loop and /report
 * turn that single value into four sentences that are false on the second
 * meaning:
 *
 *   connections errored  → "Connect a channel first — Sahoda has nowhere to
 *                          plan for.", with Plan my week DISABLED, to a
 *                          workspace with four channels connected; and, in a
 *                          second component, "Connect a channel and its dial
 *                          appears here."
 *   loop_settings errored → the DEFAULT weekly budget rendered in the control
 *                          as though it were the stored one — an unmeasured
 *                          number on a spending limit
 *   loop_cycles errored  → "No week has been reported yet" on /report, and on
 *                          /loop the cost-approval halt simply disappears,
 *                          taking the approve button with it
 *
 * Every one is a claim about the customer's business that no query established,
 * and the remedy each offers cannot work. So the six reads are checked and ANY
 * error makes the whole snapshot `unreadable` — one rule rather than six
 * judgements, and one true sentence instead of four false ones.
 *
 * `readLoopSnapshot` is kept as the mechanism and is no longer called by a page.
 */

export interface LoopSnapshot {
  /**
   * Whether a `loop_settings` ROW EXISTS — i.e. whether anybody has ever turned
   * the Loop on here.
   *
   * `paused` could not carry this. A missing row read as `paused: false`, which
   * is the same value as "switched on and running", so the screen could not
   * tell a customer who has never opened the Loop from one whose week is about
   * to be planned. `never_enabled` is the reason most of this fleet is in:
   * MEASURED 2026-08-28, 5 of 33 production workspaces have a row at all.
   */
  enabled: boolean
  paused: boolean
  weeklyBudgetCredits: number
  /**
   * Credits this workspace can actually spend — total minus held.
   *
   * Read here rather than inferred, because the alternative is a screen that
   * offers to plan a week the workspace cannot pay for and discovers it only
   * after the cycle has opened and the ledger has taken a hold.
   */
  availableCredits: number
  /**
   * The Brand Brain: whether one is resolved, and how much of it a person has
   * actually agreed to.
   *
   * Read here because the Loop's verdict depends on it and because the number
   * is printed. `confirmed` counts `field_meta` entries marked confirmed, out
   * of the same 15 the ring on /brain uses — one denominator, so the two
   * screens cannot report different fractions of the same brain.
   */
  brain: { resolved: boolean; confirmed: number; total: number }
  /** Only the levels a person actually chose. A missing channel is not L1 — it is unset. */
  dial: Map<Channel, AutonomyLevel>
  connected: ChannelSet
  /**
   * Channels this workspace connected and whose authorisation has since lapsed.
   *
   * Separate from `connected` because "you have not connected anything" and
   * "the thing you connected stopped working" have different remedies, and
   * telling somebody to connect a channel they already connected is the screen
   * making a claim it has no grounds for.
   */
  lapsed: ChannelSet
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
export const UNSET_SNAPSHOT: Omit<LoopSnapshot, 'dial' | 'connected' | 'lapsed'> = {
  // Never turned on, and no credits read. Both are the honest default for a
  // workspace this snapshot was never built for — and `enabled: false` is what
  // makes `never_enabled` the reason rather than a silently un-paused Loop.
  enabled: false,
  availableCredits: 0,
  brain: { resolved: false, confirmed: 0, total: RING_DENOMINATOR },
  paused: false,
  weeklyBudgetCredits: DEFAULT_WEEKLY_BUDGET_CREDITS,
  cycle: null,
  briefs: [],
  learnings: [],
}

/**
 * The three things that can be true of "what is the Loop doing", each with its
 * own sentence and its own remedy.
 *
 * `workspaceId` rides along on the `ok` arm because both pages need it for the
 * further reads they make (the ranking, the cycle's learnings) — carrying it
 * here means neither page resolves the workspace a second time and gets a
 * different answer.
 */
export type LoopRead =
  | { status: 'ok'; workspaceId: string; snapshot: LoopSnapshot }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/** The Loop for the active workspace, with the reason when there is nothing. */
export async function readLoop(): Promise<LoopRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return { status: 'unreadable' }
    if (workspace.status === 'none') return { status: 'no-workspace' }

    const snapshot = await readLoopSnapshot(workspace.workspace.id)
    if (snapshot === null) return { status: 'unreadable' }
    return { status: 'ok', workspaceId: workspace.workspace.id, snapshot }
  } catch {
    return { status: 'unreadable' }
  }
}

/**
 * The six queries, or `null` when any of them failed.
 *
 * Null rather than a throw so the caller decides what an unanswered question
 * means for its screen — and so this stays one place to look for "which tables
 * does the Loop read".
 */
export async function readLoopSnapshot(workspaceId: string): Promise<LoopSnapshot | null> {
  const supabase = createServerSupabase()

  const [settingsRes, dialRes, connRes, cycleRes, brainRes, balanceRes, learnRes] =
    await Promise.all([
      supabase
        .from('loop_settings')
        .select('paused, weekly_budget_credits')
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
      supabase
        .from('loop_channel_autonomy')
        .select('channel, level')
        .eq('workspace_id', workspaceId),
      supabase
        .from('connections')
        .select('platform, status')
        .eq('workspace_id', workspaceId)
        // BOTH vocabularies, deliberately. `connected` and `lapsed` below are
        // derived from these same rows, so narrowing this to 'active' alone would
        // make `lapsed` permanently empty while every test still passed.
        //
        // What it used to carry was 'connected', which `connections.status` cannot
        // hold — check (status in ('active','expired','revoked','error')),
        // 20260718000005_connections.sql:9 — so it matched no row on any
        // workspace and the screen read that as "you have no channels". A bad
        // INSERT raises 23514; a bad WHERE is a valid query that finds nothing.
        //
        // The members are written out rather than spread from LIVE_STATUS /
        // LAPSED_STATUS: both guards that pin this
        // (lib/connections/status-vocabulary.test.ts,
        // lib/repo/check-constraints.test.ts) read the SOURCE TEXT, so a constant
        // makes this query invisible to them — the file drops out of the very
        // list that is supposed to be watching it. MEASURED: with the spread here
        // both scanners reported this file as carrying no comparison at all.
        .in('status', ['active', 'expired', 'revoked', 'error']),
      supabase
        .from('loop_cycles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('brand_memory')
        .select('payload')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('credit_balances')
        .select('balance_total, balance_held')
        .eq('workspace_id', workspaceId)
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

  // ── FOUR OF THE FIVE, AND WHY `memory_events` IS NOT ONE OF THEM ──────────
  // A failed read makes the snapshot a guess only where the screen turns the
  // empty value into a CLAIM. These four do:
  //
  //   loop_settings           the stored weekly budget, shown as a number
  //   loop_channel_autonomy   the level each channel is running at
  //   connections             "Connect a channel first", and Plan my week
  //   loop_cycles             "No week has been reported yet", and the halt
  //
  // `memory_events` does not. `PendingLearnings` returns null for an empty list
  // (learnings.tsx:33), so a failed read renders NOTHING — no sentence, no
  // figure, nothing to be wrong about. Blanking the whole page for it would buy
  // no honesty and would hide the cost-approval halt, which is the one thing on
  // this screen that is time-sensitive. An over-broad rule is not a safer rule.
  //
  // `maybeSingle` reports a missing row as `data: null, error: null`, so this
  // catches transport and RLS faults without mistaking an empty table for one.
  // `credit_balances` joins the four: the number it carries is printed as the
  // customer's own balance and is compared against a price before a spend. A
  // failed read defaulting to zero would tell somebody with 1,196 credits to
  // top up, which is both false and a dead end.
  // `brand_memory` joins them for the same reason: a failed read defaulting to
  // "no brain" would tell a customer with a resolved brain to go and build one,
  // and send them to a screen that would show them the brain they already have.
  for (const res of [settingsRes, dialRes, connRes, cycleRes, brainRes, balanceRes]) {
    if (res.error) return null
  }

  const dial = new Map<Channel, AutonomyLevel>()
  for (const row of dialRes.data ?? []) {
    dial.set(row.channel as Channel, row.level as AutonomyLevel)
  }

  const channelsWith = (statuses: readonly string[]): ChannelSet =>
    toChannelSet(
      (connRes.data ?? [])
        .filter((r) => statuses.includes(r.status as string))
        // Filter the STRING, then narrow — see the same change in
        // `actions/radar.ts`. `connections.platform` holds fourteen values now
        // and `Channel` is six of them, so `as Channel` here asserted something
        // untrue of eight rows. `PLANNABLE` still does the real work.
        .map((r) => r.platform as string)
        .filter((p): p is Channel => PLANNABLE.includes(p)),
    )
  const connected = channelsWith(LIVE_STATUS)
  // Lapsed only where it is not ALSO live: a workspace with two Instagram
  // accounts, one live and one expired, has a working Instagram. Reporting it
  // in both sets would put the same channel in the dial and in the "reconnect"
  // line at once, and only one of those is true.
  const lapsed = toChannelSet(channelsWith(LAPSED_STATUS).filter((c) => !connected.includes(c)))

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
    const { data, error } = await supabase
      .from('loop_briefs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('cycle_id', cycle.id)
      .order('priority')
    // The sixth read, and the one whose empty answer costs the most: the cost
    // preview prices the briefs, so an errored read would show a week that
    // writes nothing for zero credits and invite an approval of it.
    if (error) return null
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
    enabled: settingsRes.data !== null,
    brain: {
      resolved: brainRes.data !== null,
      confirmed: countConfirmedFields(brainRes.data?.payload),
      total: RING_DENOMINATOR,
    },
    paused: Boolean(settingsRes.data?.paused),
    availableCredits: Math.max(
      0,
      ((balanceRes.data?.balance_total as number | undefined) ?? 0) -
        ((balanceRes.data?.balance_held as number | undefined) ?? 0),
    ),
    weeklyBudgetCredits:
      (settingsRes.data?.weekly_budget_credits as number | undefined) ??
      DEFAULT_WEEKLY_BUDGET_CREDITS,
    dial,
    connected,
    lapsed,
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
